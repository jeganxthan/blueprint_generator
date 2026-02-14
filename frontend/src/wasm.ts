import init, { render_blueprint } from "./wasm/blueprint_wasm";

let initialized = false;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 800;
const PADDING = 40;

type Room = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Blueprint = {
  rooms: Room[];
};

export async function renderBlueprint(data: unknown) {
  if (!initialized) {
    await init();
    initialized = true;
  }

  const normalized = normalizeBlueprint(data);
  const svg = render_blueprint(JSON.stringify(normalized));
  return ensureViewBox(svg);
}

function normalizeBlueprint(data: unknown): Blueprint {
  const sourceRooms = (data as { rooms?: unknown[] })?.rooms;
  if (!Array.isArray(sourceRooms) || sourceRooms.length === 0) {
    return { rooms: [] };
  }

  const rooms = sourceRooms
    .map((room, index) => toRoom(room, index))
    .filter((room): room is Room => room !== null);

  if (rooms.length === 0) {
    return { rooms: [] };
  }

  const fittedRooms = fitRoomsToCanvas(rooms);
  if (hasOverlap(fittedRooms) || !isSingleCluster(fittedRooms)) {
    return { rooms: fitRoomsToCanvas(compactConnectedLayout(fittedRooms)) };
  }
  return { rooms: fittedRooms };
}

function toRoom(raw: unknown, index: number): Room | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const room = raw as Partial<Room>;
  const x = toFiniteNumber(room.x);
  const y = toFiniteNumber(room.y);
  const width = toFiniteNumber(room.width);
  const height = toFiniteNumber(room.height);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    name: sanitizeRoomName(room.name, index),
    x,
    y,
    width,
    height
  };
}

function sanitizeRoomName(name: unknown, index: number): string {
  if (typeof name === "string" && name.trim() !== "") {
    return name.trim().slice(0, 42);
  }
  return `Room ${index + 1}`;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasOverlap(rooms: Room[]): boolean {
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      if (intersects(rooms[i], rooms[j], 0.5)) {
        return true;
      }
    }
  }
  return false;
}

function intersects(a: Room, b: Room, tolerance: number): boolean {
  return (
    a.x < b.x + b.width - tolerance &&
    a.x + a.width > b.x + tolerance &&
    a.y < b.y + b.height - tolerance &&
    a.y + a.height > b.y + tolerance
  );
}

function isSingleCluster(rooms: Room[]): boolean {
  if (rooms.length <= 1) {
    return true;
  }

  const visited = new Set<number>([0]);
  const queue: number[] = [0];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    for (let i = 0; i < rooms.length; i += 1) {
      if (visited.has(i)) {
        continue;
      }
      if (touchesOrOverlaps(rooms[current], rooms[i])) {
        visited.add(i);
        queue.push(i);
      }
    }
  }

  return visited.size === rooms.length;
}

function touchesOrOverlaps(a: Room, b: Room): boolean {
  const edgeTolerance = 2;
  if (intersects(a, b, 0)) {
    return true;
  }

  const horizontalTouch =
    Math.abs(a.x + a.width - b.x) <= edgeTolerance ||
    Math.abs(b.x + b.width - a.x) <= edgeTolerance;
  const verticalTouch =
    Math.abs(a.y + a.height - b.y) <= edgeTolerance ||
    Math.abs(b.y + b.height - a.y) <= edgeTolerance;

  const yOverlap = rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
  const xOverlap = rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width);

  return (horizontalTouch && yOverlap) || (verticalTouch && xOverlap);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function compactConnectedLayout(rooms: Room[]): Room[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(rooms.length)));
  const rows = Math.ceil(rooms.length / columns);
  const availableWidth = Math.max(CANVAS_WIDTH - PADDING * 2, 1);
  const availableHeight = Math.max(CANVAS_HEIGHT - PADDING * 2, 1);
  const rowHeight = availableHeight / rows;
  const relaidOut: Room[] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowRooms = rooms.slice(row * columns, (row + 1) * columns);
    if (rowRooms.length === 0) {
      continue;
    }

    const weights = rowRooms.map((room) => Math.max(room.width * room.height, 1));
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    let cursorX = PADDING;

    rowRooms.forEach((room, index) => {
      const width =
        index === rowRooms.length - 1
          ? PADDING + availableWidth - cursorX
          : (availableWidth * weights[index]) / weightSum;

      relaidOut.push({
        ...room,
        x: round2(cursorX),
        y: round2(PADDING + row * rowHeight),
        width: round2(Math.max(width, 1)),
        height: round2(Math.max(rowHeight, 1))
      });

      cursorX += width;
    });
  }

  return relaidOut;
}

function fitRoomsToCanvas(rooms: Room[]): Room[] {
  if (rooms.length === 0) {
    return [];
  }

  const minX = Math.min(...rooms.map((room) => room.x));
  const minY = Math.min(...rooms.map((room) => room.y));
  const maxX = Math.max(...rooms.map((room) => room.x + room.width));
  const maxY = Math.max(...rooms.map((room) => room.y + room.height));

  const sourceWidth = Math.max(maxX - minX, 1);
  const sourceHeight = Math.max(maxY - minY, 1);
  const scaleX = (CANVAS_WIDTH - PADDING * 2) / sourceWidth;
  const scaleY = (CANVAS_HEIGHT - PADDING * 2) / sourceHeight;
  const scale = clampFinite(Math.min(scaleX, scaleY), 0.15, 30);

  return rooms.map((room) => ({
    ...room,
    x: round2((room.x - minX) * scale + PADDING),
    y: round2((room.y - minY) * scale + PADDING),
    width: round2(Math.max(room.width * scale, 1)),
    height: round2(Math.max(room.height * scale, 1))
  }));
}

function ensureViewBox(svg: string): string {
  const openingTag = svg.match(/<svg[^>]*>/i)?.[0];
  if (!openingTag || /viewBox=/i.test(openingTag)) {
    return svg;
  }

  const width = extractDimension(openingTag, "width") ?? CANVAS_WIDTH;
  const height = extractDimension(openingTag, "height") ?? CANVAS_HEIGHT;
  const patched = openingTag.replace(
    /^<svg/i,
    `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"`
  );

  return svg.replace(openingTag, patched);
}

function extractDimension(tag: string, attr: string): number | null {
  const match = tag.match(new RegExp(`${attr}=["']([\\d.]+)["']`, "i"));
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
