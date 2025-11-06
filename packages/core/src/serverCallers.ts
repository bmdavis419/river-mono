import { err } from 'neverthrow';
import type { CreateServerSideCaller } from './types';
import { RiverError } from './errors';

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
