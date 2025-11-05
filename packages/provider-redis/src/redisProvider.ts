import {
	encodeRiverResumptionToken,
	RiverError,
	type RiverProvider,
	type RiverSpecialErrorChunk,
	type RiverSpecialStartChunk,
	type RiverSpecialEndChunk
} from '@davis7dotsh/river-core';
import type Redis from 'ioredis';
import { err, ok, Result, ResultAsync } from 'neverthrow';

const REDIS_PROVIDER_ID = 'redis';

const getRedisStreamKey = (args: { streamStorageId: string; streamRunId: string }) =>
	`stream-${args.streamStorageId}-${args.streamRunId}`;

export const redisProvider = (args: {
	redisClient: Redis;
	waitUntil: (promise: Promise<unknown>) => void | undefined;
	streamStorageId: string;
}): RiverProvider<true> => ({
	providerId: REDIS_PROVIDER_ID,
	isResumable: true,
	resumeStream: async ({ abortController, resumptionToken }) => {
		const { redisClient } = args;

		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const redisStreamKey = getRedisStreamKey({
					streamStorageId: resumptionToken.streamStorageId,
					streamRunId: resumptionToken.streamRunId
				});

				const encoder = new TextEncoder();

				const safeSendChunk = (chunk: string) => {
					return Result.fromThrowable(
						() => {
							if (!abortController.signal.aborted) {
								controller.enqueue(encoder.encode(chunk));
								return null;
							} else {
								throw new Error('tried to send chunk after stream was canceled');
							}
						},
						() => {
							return;
						}
					)();
				};

				const appendChunk = async (chunk: string) => {
					return safeSendChunk(chunk);
				};

				const appendError = async (error: RiverError) => {
					const errorChunk: RiverSpecialErrorChunk = {
						RIVER_SPECIAL_TYPE_KEY: 'stream_error',
						streamRunId: resumptionToken.streamRunId,
						error
					};

					const sseChunk = `data: ${JSON.stringify(errorChunk)}\n\n`;

					const errorSendResult = await safeSendChunk(sseChunk);

					if (errorSendResult.isErr()) {
						return errorSendResult;
					}

					abortController.abort();

					return ok(null);
				};

				let totalTriesToSend = 0;
				let hasEnded = false;
				let lastId = '0';

				while (totalTriesToSend < 10 && !hasEnded) {
					totalTriesToSend += 1;

					const streamsResult = await ResultAsync.fromPromise(
						redisClient.xread('BLOCK', 2000, 'STREAMS', redisStreamKey, lastId),
						(error) =>
							new RiverError('Failed to read stream', error, 'stream', {
								redisStreamKey
							})
					);

					if (streamsResult.isErr()) {
						await appendError(streamsResult.error);
						break;
					}

					const streamsValue = streamsResult.value;

					if (!streamsValue || streamsValue.length === 0) {
						continue;
					}

					const [result] = streamsValue;

					if (!result) {
						continue;
					}

					const [, entries] = result;

					for (const [id, fields] of entries) {
						const [type, data] = fields;

						if (type === 'chunk' && data) {
							if (data.includes('RIVER_SPECIAL_TYPE_KEY') && data.includes('stream_end')) {
								hasEnded = true;
								break;
							}
							await appendChunk(data);
						}

						lastId = id;
					}
				}

				if (!hasEnded) {
					await appendError(
						new RiverError('Stream ended unexpectedly', undefined, 'stream', {
							redisStreamKey
						})
					);
				}

				return;
			},
			async cancel(reason) {
				abortController.abort(reason);
			}
		});

		return ok(stream);
	},
	initStream: async ({ abortController, adapterRequest, routerStreamKey, input, runnerFn }) => {
		let startTime = performance.now();

		const streamRunId = crypto.randomUUID();

		const { redisClient, waitUntil, streamStorageId } = args;

		const encodeResumptionTokenResult = encodeRiverResumptionToken({
			providerId: REDIS_PROVIDER_ID,
			routerStreamKey,
			streamStorageId,
			streamRunId
		});

		if (encodeResumptionTokenResult.isErr()) {
			return err(encodeResumptionTokenResult.error);
		}

		let streamController: ReadableStreamDefaultController<Uint8Array>;

		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				streamController = controller;
			},
			async cancel(reason) {
				console.log('canceling stream', reason);
				abortController.abort(reason);
			}
		});

		const encoder = new TextEncoder();

		let totalChunks = 0;

		const redisStreamKey = getRedisStreamKey({ streamStorageId, streamRunId });

		const safeSendChunk = async (chunk: unknown) => {
			let sseChunk: string;
			try {
				sseChunk = `data: ${JSON.stringify(chunk)}\n\n`;
			} catch {
				sseChunk = `data: ${chunk}\n\n`;
			}
			totalChunks++;
			// we don't care if this explodes, it will if it's aborted anyway
			Result.fromThrowable(
				() => {
					if (!abortController.signal.aborted) {
						streamController.enqueue(encoder.encode(sseChunk));
						return null;
					} else {
						console.log('tried to send chunk after stream was canceled');
						throw new Error('tried to send chunk after stream was canceled');
					}
				},
				() => {
					return;
				}
			)();
			return await ResultAsync.fromPromise(
				redisClient.xadd(redisStreamKey, '*', 'chunk', sseChunk),
				(error) => new RiverError('Failed to send chunk to Redis', error, 'stream')
			).map(() => null);
		};

		const startChunk: RiverSpecialStartChunk = {
			RIVER_SPECIAL_TYPE_KEY: 'stream_start',
			streamRunId,
			encodedResumptionToken: encodeResumptionTokenResult.value
		};

		const startSendResult = await safeSendChunk(startChunk);

		if (startSendResult.isErr()) {
			return err(startSendResult.error);
		}

		const appendChunk = async (chunk: unknown) => {
			return safeSendChunk(chunk);
		};

		const appendError = async (error: RiverError) => {
			const errorChunk: RiverSpecialErrorChunk = {
				RIVER_SPECIAL_TYPE_KEY: 'stream_error',
				streamRunId,
				error
			};

			const errorSendResult = await safeSendChunk(errorChunk);

			if (errorSendResult.isErr()) {
				return errorSendResult;
			}

			abortController.abort();

			return ok(null);
		};

		const close = async () => {
			const endChunk: RiverSpecialEndChunk = {
				RIVER_SPECIAL_TYPE_KEY: 'stream_end',
				totalChunks,
				totalTimeMs: performance.now() - startTime
			};

			const closeSendResult = await safeSendChunk(endChunk);

			if (closeSendResult.isErr()) {
				return closeSendResult;
			}

			if (!abortController.signal.aborted) {
				streamController.close();
			}

			return ok(null);
		};

		const run = async () => {
			const runnerResult = await ResultAsync.fromPromise(
				runnerFn({
					input,
					streamRunId,
					streamStorageId,
					stream: { appendChunk, appendError, close },
					abortSignal: abortController.signal,
					adapterRequest
				}),
				(error) => new RiverError('Failed to run runner function', error, 'stream')
			);

			if (runnerResult.isErr()) {
				console.error(runnerResult.error);
			}
		};

		waitUntil(run());

		return ok(stream);
	}
});
