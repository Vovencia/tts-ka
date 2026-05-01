export function Round(value: number, {
	fraction = 0,
}: {
	fraction?: number;
} = {}): number {
	fraction = Math.pow(10, fraction);

	return Math.round(value * fraction) / fraction;
}
