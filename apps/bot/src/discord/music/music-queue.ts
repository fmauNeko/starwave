export interface Track {
  url: string;
  title: string;
  duration: number;
  thumbnail: string;
  requestedBy: string;
}

export enum LoopMode {
  None = 'none',
  Track = 'track',
  Queue = 'queue',
}

export class MusicQueue {
  private tracks: Track[] = [];
  private currentIndex = 0;
  private loopMode: LoopMode = LoopMode.None;

  public add(track: Track): number {
    this.tracks.push(track);
    return this.tracks.length;
  }

  public addMany(tracks: Track[]): number {
    this.tracks.push(...tracks);
    return this.tracks.length;
  }

  public getCurrent(): Track | undefined {
    return this.tracks[this.currentIndex];
  }

  public getNext(): Track | undefined {
    if (this.tracks.length === 0) {
      return undefined;
    }

    if (this.loopMode === LoopMode.Track) {
      return this.tracks[this.currentIndex];
    }

    const nextIndex = this.currentIndex + 1;

    if (nextIndex >= this.tracks.length) {
      if (this.loopMode === LoopMode.Queue) {
        this.currentIndex = 0;
        return this.tracks[0];
      }
      return undefined;
    }

    this.currentIndex = nextIndex;
    return this.tracks[this.currentIndex];
  }

  public skip(): Track | undefined {
    const nextIndex = this.currentIndex + 1;

    if (nextIndex >= this.tracks.length) {
      if (this.loopMode === LoopMode.Queue) {
        this.currentIndex = 0;
        return this.tracks[0];
      }
      return undefined;
    }

    this.currentIndex = nextIndex;
    return this.tracks[this.currentIndex];
  }

  public remove(index: number): Track | undefined {
    if (index < 0 || index >= this.tracks.length) {
      return undefined;
    }

    const [removed] = this.tracks.splice(index, 1);

    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (
      index === this.currentIndex &&
      this.currentIndex >= this.tracks.length
    ) {
      this.currentIndex = Math.max(0, this.tracks.length - 1);
    }

    return removed;
  }

  public clear(): void {
    this.tracks = [];
    this.currentIndex = 0;
  }

  public shuffle(): void {
    if (this.tracks.length === 0) {
      return;
    }

    const current = this.tracks[this.currentIndex];
    if (!current) {
      return;
    }

    const remaining = this.tracks.filter((_, i) => i !== this.currentIndex);

    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = remaining[i];
      const swap = remaining[j];
      if (temp !== undefined && swap !== undefined) {
        remaining[i] = swap;
        remaining[j] = temp;
      }
    }

    this.tracks = [current, ...remaining];
    this.currentIndex = 0;
  }

  public getAll(): Track[] {
    return [...this.tracks];
  }

  public getUpcoming(): Track[] {
    return this.tracks.slice(this.currentIndex + 1);
  }

  public size(): number {
    return this.tracks.length;
  }

  public isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public setLoopMode(mode: LoopMode): void {
    this.loopMode = mode;
  }

  public getLoopMode(): LoopMode {
    return this.loopMode;
  }

  public cycleLoopMode(): LoopMode {
    const modes = [LoopMode.None, LoopMode.Track, LoopMode.Queue] as const;
    const currentModeIndex = modes.indexOf(this.loopMode);
    const nextMode = modes[(currentModeIndex + 1) % modes.length];
    this.loopMode = nextMode ?? LoopMode.None;
    return this.loopMode;
  }
}
