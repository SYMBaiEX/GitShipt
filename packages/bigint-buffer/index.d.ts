/// <reference types="node" />

export function toBigIntBE(buffer: Buffer): bigint;
export function toBigIntLE(buffer: Buffer): bigint;
export function toBufferBE(number: bigint, width: number): Buffer;
export function toBufferLE(number: bigint, width: number): Buffer;
