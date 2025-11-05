# river

_an experiment by <a href="https://davis7.sh" target="_blank">ben davis</a> that went WAY too far..._

## it's TRPC, but for agents/streams...

```svelte
<script lang="ts">
	import { myRiverClient } from '$lib/river/client';

	// ALL of this is type safe, feels just like TRPC
	const { start, stop, status } = myRiverClient.basicExample({
		onStart: () => {
			console.log('starting basic example');
		},
		onChunk: (chunk) => {
			// full type safety on the chunks
			console.log(chunk);
		},
		onError: (error) => {
			console.error(error);
		},
		onSuccess: () => {
			console.log('Success');
		},
		onCancel: () => {
			console.log('Canceled');
		},
		onStreamInfo: (streamInfo) => {
			console.log(streamInfo);
		}
	});
</script>
```

docs: TODO
