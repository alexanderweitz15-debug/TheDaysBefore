// Rubber band rectangle while dragging a selection (screen coordinates).
import { selectionBox } from '../../render/view-state';

export function SelectionBox() {
  const b = selectionBox.value;
  if (!b) return null;
  return (
    <div
      class="sz-selbox"
      data-tutorial-id="selection-box"
      style={{
        left: `${Math.min(b.x0, b.x1)}px`,
        top: `${Math.min(b.y0, b.y1)}px`,
        width: `${Math.abs(b.x1 - b.x0)}px`,
        height: `${Math.abs(b.y1 - b.y0)}px`,
      }}
    />
  );
}
