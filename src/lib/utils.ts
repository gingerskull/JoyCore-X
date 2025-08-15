import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Button function mappings for firmware behavior values
export const ButtonFunctionLabels = {
  normal: 'Normal',
  momentary: 'Momentary',
  encoder_a: 'Encoder A',
  encoder_b: 'Encoder B',
} as const;

export type ButtonFunction = keyof typeof ButtonFunctionLabels;

// Helper to get display label for button function
export function getButtonFunctionLabel(func: string): string {
  return ButtonFunctionLabels[func as ButtonFunction] || 'Unknown';
}
