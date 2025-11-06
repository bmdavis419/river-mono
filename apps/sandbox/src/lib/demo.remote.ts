import { command, getRequestEvent } from '$app/server';
import z from 'zod';
import { myServerCaller } from './river/serverCaller';
import { error } from '@sveltejs/kit';

export const remoteStartUnreliableStreamInBg = command(
	z.object({
		prompt: z.string()
	}),
	async ({ prompt }) => {
		const event = getRequestEvent();
		const bgStartResult = await myServerCaller.startStreamInBackground('redisResume')({
			input: {
				prompt
			},
			adapterRequest: {
				event
			}
		});

		if (bgStartResult.isErr()) {
			console.error(bgStartResult.error);
			return error(500, bgStartResult.error);
		}

		return {
			resumeKey: bgStartResult.value.encodedResumptionToken
		};
	}
);

export const remoteRunUnreliableStream = command(
	z.object({
		prompt: z.string()
	}),
	async ({ prompt }) => {
		const event = getRequestEvent();
		const streamResult = await myServerCaller.startStreamAndConsume('redisResume')({
			input: {
				prompt
			},
			adapterRequest: {
				event
			}
		});

		if (streamResult.isErr()) {
			console.error(streamResult.error);
			return error(500, streamResult.error);
		}

		const stream = streamResult.value;
		let totalLetters = 0;
		let resumeKey: string | null = null;
		let totalVowels = 0;

		for await (const chunk of stream) {
			if (chunk.type === 'special') {
				if (chunk.special.RIVER_SPECIAL_TYPE_KEY === 'stream_start') {
					resumeKey = chunk.special.encodedResumptionToken ?? null;
				}
			}
			console.log(chunk);
			if (chunk.type === 'chunk') {
				if (chunk.chunk.isVowel) {
					totalVowels++;
				}
				totalLetters++;
			}
		}

		return {
			totalVowels,
			totalLetters,
			resumeKey
		};
	}
);
