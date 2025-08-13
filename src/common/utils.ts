import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '../types';

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Create a standardized API response
 */
export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T): ApiResponse<T> {
  return createApiResponse(true, data);
}

/**
 * Create an error response
 */
export function errorResponse(error: string): ApiResponse {
  return createApiResponse(false, undefined, error);
}

/**
 * Wait for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a value is a valid port number
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Sanitize input to prevent injection attacks
 */
export function sanitizeInput(input: any): string {
  if (typeof input !== 'string') {
    input = String(input);
  }
  return input.replace(/[<>]/g, '').trim();
}

/**
 * Calculate estimated wait time based on queue position
 */
export function calculateEstimatedWaitTime(
  position: number,
  averageSessionDuration: number = 300000 // 5 minutes default
): number {
  return position * averageSessionDuration;
}

/**
 * Check if a URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Check if a timestamp has expired
 */
export function isExpired(timestamp: number, timeoutMs: number): boolean {
  return (now() - timestamp) > timeoutMs;
}