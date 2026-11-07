export function createTestClock(initialTime: Date) {
  let currentTime = initialTime;

  return {
    now: () => new Date(currentTime),
    set: (time: Date) => {
      currentTime = time;
    },
  };
}
