export const Params = new class Params {
	protected _storage = this.getStorage();

	public Get<IKey extends keyof IParams>(key: IKey): IParams[IKey] {
		return this._storage[key];
	}
	public Set<IKey extends keyof IParams>(key: IKey, value: IParams[IKey]): void {
		this.setStorage({
			...this._storage,
			[key]: value,
		});
	}

	protected getStorage() {
		return JSON.parse(localStorage.getItem("TTSka-params") ?? "{}")
	}
	protected setStorage(storage: IParams) {
		localStorage.setItem("TTSka-params", JSON.stringify(storage));
		this._storage = this.getStorage();
	}
}();

interface IParams {
  voice?: IVoice;
  token?: string;
}

type IVoice = (
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'sage'
  | 'shimmer'
  | 'verse'
  | 'marin'
  | 'cedar'
)
