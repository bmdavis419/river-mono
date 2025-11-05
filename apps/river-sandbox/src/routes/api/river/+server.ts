import { myRiverRouter } from '$lib/river/router';
import { riverEndpointHandler } from '@davis7dotsh/river-sveltekit';

export const { GET, POST } = riverEndpointHandler(myRiverRouter);
