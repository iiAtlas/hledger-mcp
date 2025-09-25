import { ValidationError } from "../types.js";

export interface EntryLocation {
  filePath: string;
  startLine: number;
  endLine: number;
}

function splitIntoSegments(content: string): string[] {
  const segments: string[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      segments.push(content.slice(start, index + 1));
      start = index + 1;
    }
  }

  if (start < content.length) {
    segments.push(content.slice(start));
  }

  if (segments.length === 0) {
    segments.push("");
  }

  return segments;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function isBlank(segment: string): boolean {
  return segment.trim().length === 0;
}

export class JournalFileEditor {
  private segments: string[];

  constructor(content: string) {
    this.segments = splitIntoSegments(content);
  }

  extract(startLine: number, endLine: number): string {
    this.assertRange(startLine, endLine);
    const startIndex = startLine - 1;
    const endIndex = endLine - 1;
    return this.segments.slice(startIndex, endIndex + 1).join("");
  }

  remove(startLine: number, endLine: number, collapseFollowingBlank = true) {
    this.assertRange(startLine, endLine);

    const startIndex = startLine - 1;
    const endIndex = endLine - 1;
    const removedSegments = this.segments.slice(startIndex, endIndex + 1);

    let trailingBlankRemoved = false;
    const followingSegment = this.segments[endIndex + 1];

    if (collapseFollowingBlank && followingSegment && isBlank(followingSegment)) {
      trailingBlankRemoved = true;
      this.segments.splice(startIndex, removedSegments.length + 1);
    } else {
      this.segments.splice(startIndex, removedSegments.length);
    }

    return {
      removedText: removedSegments.join(""),
      trailingBlankRemoved,
    };
  }

  replace(startLine: number, endLine: number, replacement: string) {
    this.assertRange(startLine, endLine);

    const normalizedReplacement = ensureTrailingNewline(
      normalizeNewlines(replacement),
    );

    const replacementSegments = splitIntoSegments(normalizedReplacement);
    const startIndex = startLine - 1;
    const endIndex = endLine - 1;
    const segmentCount = endIndex - startIndex + 1;

    const removedSegments = this.segments.slice(startIndex, endIndex + 1);

    this.segments.splice(startIndex, segmentCount, ...replacementSegments);

    return {
      removedText: removedSegments.join(""),
      insertedText: normalizedReplacement,
    };
  }

  toString(): string {
    return this.segments.join("");
  }

  private assertRange(startLine: number, endLine: number): void {
    if (startLine < 1 || endLine < startLine) {
      throw new ValidationError("Invalid entry line range provided");
    }

    const lastLine = this.segments.length;
    if (endLine > lastLine) {
      throw new ValidationError(
        `Entry references line ${endLine}, but file only has ${lastLine} lines`,
      );
    }
  }
}

export function normalizeEntryForComparison(text: string): string {
  const normalized = normalizeNewlines(text);
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}
