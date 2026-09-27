import { ref, watch, type Ref } from "vue";

/**
 * Keyboard highlight state for a suggestion dropdown (↑/↓ to move, Enter —
 * and optionally Tab — to choose). Escape/open-close stay with the caller,
 * since the input and the paste textarea treat them differently.
 *
 * The highlight resets to `initialIndex()` whenever the set of items changes
 * (compared by key, so recomputed-but-identical lists don't reset it). An
 * index of -1 means "nothing highlighted" — Enter then does nothing.
 */
export function useSuggestNavigation<T extends { key: string }>(
  items: Ref<T[]>,
  options: { initialIndex?: () => number; acceptTab?: boolean } = {},
) {
  const initialIndex = options.initialIndex ?? (() => 0);
  const activeIndex = ref(initialIndex());

  watch(
    () => items.value.map((item) => item.key).join("|"),
    () => {
      activeIndex.value = items.value.length ? initialIndex() : -1;
    },
  );

  function move(delta: number) {
    const count = items.value.length;
    if (!count) return;
    const from = activeIndex.value < 0 ? (delta > 0 ? -1 : 0) : activeIndex.value;
    activeIndex.value = (from + delta + count) % count;
  }

  /** Handles navigation keys; returns true when the event was consumed. */
  function onKeydown(event: KeyboardEvent, onChoose: (item: T) => void): boolean {
    if (!items.value.length) return false;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }

    if (event.key === "Enter" || (options.acceptTab && event.key === "Tab")) {
      const item = items.value[activeIndex.value];
      if (!item) return false;
      event.preventDefault();
      onChoose(item);
      return true;
    }

    return false;
  }

  return { activeIndex, move, onKeydown };
}
