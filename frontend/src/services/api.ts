/**
 * MUAWIN API ABSTRACTION LAYER
 *
 * Connects the React frontend to the FastAPI backend.
 *
 * Backend:
 *   http://localhost:8000
 *
 * API:
 *   http://localhost:8000/api
 */

export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
    ? import.meta.env.VITE_API_BASE_URL
    : 'http://localhost:8000/api';

export const USE_MOCK_API = false;

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  message?: string;
  success: boolean;
}

/**
 * The localStorage key used by MUAWIN for the FastAPI session token.
 */
export const AUTH_TOKEN_KEY = 'muawin_auth_token';

/**
 * Get the currently stored MUAWIN authentication token.
 */
export function getAuthToken(): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Store the MUAWIN authentication token.
 */
export function setAuthToken(token: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * Clear MUAWIN authentication/session data.
 */
export function clearAuthData(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('muawin_user');
  localStorage.removeItem('muawin_courses');
  localStorage.removeItem('muawin_selected_course');
}

/**
 * Generic fetch wrapper.
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { params, ...customConfig } = options;

  let url = `${API_BASE_URL}${
    endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  }`;

  /**
   * Query parameters
   */
  if (params) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();

    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  /**
   * Authentication
   */
  const token = getAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...(customConfig.headers || {}),
  };

  /**
   * Helpful development logging.
   *
   * We DO NOT print the actual token for security.
   */
  if (import.meta.env?.DEV) {
    console.log(
      `[API Client] ${customConfig.method || 'GET'} ${url}`,
      token ? '(authenticated)' : '(NO AUTH TOKEN)'
    );
  }

  try {
    const response = await fetch(url, {
      ...customConfig,
      headers,
    });

    /**
     * Try to parse JSON.
     */
    const data = await response.json().catch(() => null);

    /**
     * Handle HTTP errors.
     */
    if (!response.ok) {
      if (response.status === 401) {
        console.warn(
          `[API Client] 401 Unauthorized for ${endpoint}. ` +
          `The stored MUAWIN session token may be missing, expired, ` +
          `or invalid.`
        );

        clearAuthData();
      }

      throw new Error(
        data?.detail ||
          data?.message ||
          `HTTP error! status: ${response.status}`
      );
    }

    return {
      data,
      status: response.status,
      success: true,
      message: data?.message,
    };
  } catch (error: any) {
    console.warn(
      `[API Client] Error requesting ${endpoint}:`,
      error?.message || error
    );

    throw error;
  }
}

/**
 * HTTP REST helpers.
 */
export const api = {
  get: <T>(
    endpoint: string,
    options?: RequestOptions
  ) =>
    request<T>(endpoint, {
      ...options,
      method: 'GET',
    }),

  post: <T>(
    endpoint: string,
    body?: any,
    options?: RequestOptions
  ) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body:
        body !== undefined && body !== null
          ? JSON.stringify(body)
          : undefined,
    }),

  put: <T>(
    endpoint: string,
    body?: any,
    options?: RequestOptions
  ) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body:
        body !== undefined && body !== null
          ? JSON.stringify(body)
          : undefined,
    }),

  delete: <T>(
    endpoint: string,
    options?: RequestOptions
  ) =>
    request<T>(endpoint, {
      ...options,
      method: 'DELETE',
    }),

  del: <T>(
    endpoint: string,
    options?: RequestOptions
  ) =>
    request<T>(endpoint, {
      ...options,
      method: 'DELETE',
    }),
};

export default api;