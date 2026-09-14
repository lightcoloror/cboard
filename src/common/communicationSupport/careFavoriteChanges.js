// Reusing a favorite changes local usage metadata, not shared content.
export function sameCareFavoriteContent(left, right) {
  const content = item => {
    const { usageCount, lastUsedAt, updatedAt, ...value } = item;
    return JSON.stringify(value);
  };
  return content(left) === content(right);
}

export function sameCareFavoriteList(left, right) {
  return (
    left.length === right.length &&
    left.every((item, index) => sameCareFavoriteContent(item, right[index]))
  );
}
