export function shuffle(list) {
  var random = (max) => {
    return Math.floor(Math.random() * max);
  };

  return list.reduce(
    (acc, _e) => {
      const { rest, shuffled } = acc;

      var i = random(rest.length);
      var e = { ...rest[i] };

      shuffled.push(e);

      rest.splice(i, 1);

      return acc;
    },
    { rest: [...list], shuffled: [] }
  ).shuffled;
}
