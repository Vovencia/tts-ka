export function Throttle<T extends (...args: any[]) => void>(delay: number, fn: T) {
	let wait = false;
	let needCall = false;

	return (...args: Parameters<T>) => {
		if (wait) {
			needCall = true;
			return;
		}

		wait = true;
		needCall = false;
		fn(...args);

		setTimeout(() => {
			wait = false;
			if (needCall) {
				fn(...args);
			}
			needCall = false;
		}, delay);
	}
}
