"use strict";

const GRID_CELL_SIZE = 146.3;

function columnLabel(col) {
  let label = "";

  while (col >= 0) {
    label = String.fromCharCode(65 + (col % 26)) + label;
    col = Math.floor(col / 26) - 1;
  }

  return label;
}

function toGridReference(x, y, worldSize) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return "UNKNOWN";
  }

  const cols = Math.ceil(worldSize / GRID_CELL_SIZE);
  const rows = Math.ceil(worldSize / GRID_CELL_SIZE);

  const col = Math.min(
    cols - 1,
    Math.max(0, Math.floor(x / GRID_CELL_SIZE))
  );

  const row = Math.min(
    rows - 1,
    Math.max(0, Math.floor((worldSize - y) / GRID_CELL_SIZE))
  );

  return `${columnLabel(col)}${row}`;
}

module.exports = { toGridReference };