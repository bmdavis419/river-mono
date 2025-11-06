import { err } from 'neverthrow';
import type { CreateServerSideCaller } from './types';
import { RiverError } from './errors';
import { decodeRiverResumptionToken } from './resumeToken';

export const createServerSideCaller: CreateServerSideCaller = (router) => ({
	startStreamAndConsume:
		(routerStreamKey) =>
		async ({ input, adapterRequest }) => {
			const stream = router[routerStreamKey];

			if (!stream) {
				return err(
					new RiverError('Stream not found', undefined, 'internal', {
						routerStreamKey
					})
				);
			}

			return await stream.provider.serverSideRunAndConsume({
				input,
				adapterRequest,
				routerStreamKey: routerStreamKey as string,
				runnerFn: stream.runner
			});
		},
	resumeStream:
		(routerStreamKey) =>
		async ({ resumeKey }) => {
			const stream = router[routerStreamKey];

			const decodedResumptionTokenResult = decodeRiverResumptionToken(resumeKey);

			if (decodedResumptionTokenResult.isErr()) {
				return err(decodedResumptionTokenResult.error);
			}

			if (!stream) {
				return err(
					new RiverError('Stream not found', undefined, 'internal', {
						routerStreamKey
					})
				);
			}

			return await stream.provider.serverSideResumeStream({
				resumptionToken: decodedResumptionTokenResult.value
			});
		},
	startStreamInBackground:
		(routerStreamKey) =>
		async ({ input, adapterRequest }) => {
			const stream = router[routerStreamKey];

			if (!stream) {
				return err(
					new RiverError('Stream not found', undefined, 'internal', {
						routerStreamKey
					})
				);
			}

			return await stream.provider.serverSideRunInBackground({
				input,
				adapterRequest,
				routerStreamKey: routerStreamKey as string,
				runnerFn: stream.runner
			});
		}
});
