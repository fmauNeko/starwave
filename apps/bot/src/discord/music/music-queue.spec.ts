import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopMode, MusicQueue, type Track } from './music-queue';

const createTrack = (title: string): Track => ({
  url: `https://youtube.com/watch?v=${title}`,
  title,
  duration: 180,
  thumbnail: 'https://example.com/thumb.jpg',
  requestedBy: 'user#1234',
});

describe('MusicQueue', () => {
  let queue: MusicQueue;

  beforeEach(() => {
    queue = new MusicQueue();
  });

  describe('add', () => {
    it('adds a track and returns new queue length', () => {
      const track = createTrack('Track 1');
      const length = queue.add(track);

      expect(length).toBe(1);
      expect(queue.size()).toBe(1);
    });

    it('adds multiple tracks sequentially', () => {
      queue.add(createTrack('Track 1'));
      queue.add(createTrack('Track 2'));
      const length = queue.add(createTrack('Track 3'));

      expect(length).toBe(3);
    });
  });

  describe('addMany', () => {
    it('adds multiple tracks at once', () => {
      const tracks = [
        createTrack('Track 1'),
        createTrack('Track 2'),
        createTrack('Track 3'),
      ];
      const length = queue.addMany(tracks);

      expect(length).toBe(3);
      expect(queue.size()).toBe(3);
    });

    it('appends to existing tracks', () => {
      queue.add(createTrack('Track 0'));
      const length = queue.addMany([
        createTrack('Track 1'),
        createTrack('Track 2'),
      ]);

      expect(length).toBe(3);
    });
  });

  describe('getCurrent', () => {
    it('returns undefined when queue is empty', () => {
      expect(queue.getCurrent()).toBeUndefined();
    });

    it('returns the first track initially', () => {
      const track = createTrack('Track 1');
      queue.add(track);

      expect(queue.getCurrent()).toBe(track);
    });

    it('returns the current track after advancing', () => {
      queue.add(createTrack('Track 1'));
      const track2 = createTrack('Track 2');
      queue.add(track2);
      queue.getNext();

      expect(queue.getCurrent()).toBe(track2);
    });
  });

  describe('getNext', () => {
    it('returns undefined when queue is empty', () => {
      expect(queue.getNext()).toBeUndefined();
    });

    it('advances to and returns the next track', () => {
      queue.add(createTrack('Track 1'));
      const track2 = createTrack('Track 2');
      queue.add(track2);

      const next = queue.getNext();

      expect(next).toBe(track2);
      expect(queue.getCurrentIndex()).toBe(1);
    });

    it('returns undefined when at end of queue with no loop', () => {
      queue.add(createTrack('Track 1'));

      const next = queue.getNext();

      expect(next).toBeUndefined();
    });

    it('returns same track when loop mode is Track', () => {
      const track = createTrack('Track 1');
      queue.add(track);
      queue.add(createTrack('Track 2'));
      queue.setLoopMode(LoopMode.Track);

      const next = queue.getNext();

      expect(next).toBe(track);
      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('loops to beginning when loop mode is Queue and at end', () => {
      const track1 = createTrack('Track 1');
      queue.add(track1);
      queue.add(createTrack('Track 2'));
      queue.setLoopMode(LoopMode.Queue);
      queue.getNext();

      const next = queue.getNext();

      expect(next).toBe(track1);
      expect(queue.getCurrentIndex()).toBe(0);
    });
  });

  describe('skip', () => {
    it('returns undefined when queue is empty', () => {
      expect(queue.skip()).toBeUndefined();
    });

    it('advances to next track ignoring track loop mode', () => {
      queue.add(createTrack('Track 1'));
      const track2 = createTrack('Track 2');
      queue.add(track2);
      queue.setLoopMode(LoopMode.Track);

      const next = queue.skip();

      expect(next).toBe(track2);
      expect(queue.getCurrentIndex()).toBe(1);
    });

    it('loops to beginning when loop mode is Queue and at end', () => {
      const track1 = createTrack('Track 1');
      queue.add(track1);
      queue.setLoopMode(LoopMode.Queue);

      const next = queue.skip();

      expect(next).toBe(track1);
      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('returns undefined when at end with no loop', () => {
      queue.add(createTrack('Track 1'));

      const next = queue.skip();

      expect(next).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('returns undefined for negative index', () => {
      queue.add(createTrack('Track 1'));

      expect(queue.remove(-1)).toBeUndefined();
    });

    it('returns undefined for index beyond queue length', () => {
      queue.add(createTrack('Track 1'));

      expect(queue.remove(5)).toBeUndefined();
    });

    it('removes and returns track at index', () => {
      const track1 = createTrack('Track 1');
      const track2 = createTrack('Track 2');
      queue.add(track1);
      queue.add(track2);

      const removed = queue.remove(0);

      expect(removed).toBe(track1);
      expect(queue.size()).toBe(1);
      expect(queue.getCurrent()).toBe(track2);
    });

    it('adjusts currentIndex when removing track before it', () => {
      queue.add(createTrack('Track 1'));
      queue.add(createTrack('Track 2'));
      const track3 = createTrack('Track 3');
      queue.add(track3);
      queue.getNext();
      queue.getNext();

      expect(queue.getCurrentIndex()).toBe(2);

      queue.remove(0);

      expect(queue.getCurrentIndex()).toBe(1);
      expect(queue.getCurrent()).toBe(track3);
    });

    it('adjusts currentIndex when removing current track at end', () => {
      queue.add(createTrack('Track 1'));
      queue.add(createTrack('Track 2'));
      queue.getNext();

      queue.remove(1);

      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('does not adjust currentIndex when removing track after it', () => {
      queue.add(createTrack('Track 1'));
      queue.add(createTrack('Track 2'));
      queue.add(createTrack('Track 3'));

      expect(queue.getCurrentIndex()).toBe(0);

      queue.remove(2);

      expect(queue.getCurrentIndex()).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all tracks and resets index', () => {
      queue.add(createTrack('Track 1'));
      queue.add(createTrack('Track 2'));
      queue.getNext();

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.getCurrentIndex()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('shuffle', () => {
    it('does nothing when queue is empty', () => {
      queue.shuffle();

      expect(queue.size()).toBe(0);
    });

    it('does nothing when current track is undefined', () => {
      const emptyQueue = new MusicQueue();
      emptyQueue.shuffle();

      expect(emptyQueue.size()).toBe(0);
    });

    it('keeps current track at position 0 after shuffle', () => {
      const track1 = createTrack('Track 1');
      queue.add(track1);
      queue.add(createTrack('Track 2'));
      queue.add(createTrack('Track 3'));
      queue.add(createTrack('Track 4'));
      queue.add(createTrack('Track 5'));

      queue.shuffle();

      expect(queue.getCurrent()).toBe(track1);
      expect(queue.getCurrentIndex()).toBe(0);
      expect(queue.size()).toBe(5);
    });

    it('reorders remaining tracks after current', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      queue.add(createTrack('Current'));
      queue.add(createTrack('Track 2'));
      queue.add(createTrack('Track 3'));

      queue.shuffle();

      expect(queue.getAll()[0]?.title).toBe('Current');
    });
  });

  describe('getAll', () => {
    it('returns empty array for empty queue', () => {
      expect(queue.getAll()).toEqual([]);
    });

    it('returns copy of all tracks', () => {
      const track1 = createTrack('Track 1');
      const track2 = createTrack('Track 2');
      queue.add(track1);
      queue.add(track2);

      const all = queue.getAll();

      expect(all).toEqual([track1, track2]);
      expect(all).not.toBe((queue as unknown as { tracks: Track[] }).tracks);
    });
  });

  describe('getUpcoming', () => {
    it('returns empty array when queue is empty', () => {
      expect(queue.getUpcoming()).toEqual([]);
    });

    it('returns empty array when at last track', () => {
      queue.add(createTrack('Track 1'));

      expect(queue.getUpcoming()).toEqual([]);
    });

    it('returns tracks after current', () => {
      queue.add(createTrack('Track 1'));
      const track2 = createTrack('Track 2');
      const track3 = createTrack('Track 3');
      queue.add(track2);
      queue.add(track3);

      const upcoming = queue.getUpcoming();

      expect(upcoming).toEqual([track2, track3]);
    });
  });

  describe('size', () => {
    it('returns 0 for empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('returns correct count', () => {
      queue.add(createTrack('Track 1'));
      queue.add(createTrack('Track 2'));

      expect(queue.size()).toBe(2);
    });
  });

  describe('isEmpty', () => {
    it('returns true for empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('returns false for non-empty queue', () => {
      queue.add(createTrack('Track 1'));

      expect(queue.isEmpty()).toBe(false);
    });
  });

  describe('getCurrentIndex', () => {
    it('returns 0 initially', () => {
      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('returns correct index after advancing', () => {
      queue.add(createTrack('Track 1'));
      queue.add(createTrack('Track 2'));
      queue.getNext();

      expect(queue.getCurrentIndex()).toBe(1);
    });
  });

  describe('setLoopMode', () => {
    it('sets loop mode', () => {
      queue.setLoopMode(LoopMode.Track);

      expect(queue.getLoopMode()).toBe(LoopMode.Track);
    });
  });

  describe('getLoopMode', () => {
    it('returns None by default', () => {
      expect(queue.getLoopMode()).toBe(LoopMode.None);
    });
  });

  describe('cycleLoopMode', () => {
    it('cycles None -> Track -> Queue -> None', () => {
      expect(queue.cycleLoopMode()).toBe(LoopMode.Track);
      expect(queue.cycleLoopMode()).toBe(LoopMode.Queue);
      expect(queue.cycleLoopMode()).toBe(LoopMode.None);
      expect(queue.cycleLoopMode()).toBe(LoopMode.Track);
    });
  });
});
