import { ApiError } from '../components/ErrorModal';

/**
 * Parse a caught error into a structured ApiError object
 * that can be displayed in the ErrorModal
 */
export function parseApiError(error: any, endpoint?: string): ApiError {
  // Debug logging
  console.log('=== ERROR DETAILS ===');
  console.log('Error object:', error);
  console.log('Error message:', error.message);
  console.log('Error name:', error.name);
  console.log('Error code:', error.code);
  console.log('Error status:', error.status || error.statusCode);
  console.log('Endpoint:', endpoint);
  console.log('===================');
  // Collect debug info
  const debugLines = [
    `Name: ${error.name || 'N/A'}`,
    `Message: ${error.message || 'N/A'}`,
    `Code: ${error.code || 'N/A'}`,
    `Status: ${error.status || error.statusCode || 'N/A'}`,
  ];

  // Network/connection errors
  if (error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network request failed') ||
      error.message?.includes('fetch failed')) {
    return {
      type: 'network',
      message: 'Unable to connect to the server',
      endpoint,
      details: 'The server may be offline or unreachable. Please check your network connection and verify that the server is running.',
      debugInfo: debugLines.join('\n'),
    };
  }

  // Connection refused
  if (error.message?.includes('ECONNREFUSED') ||
      error.code === 'ECONNREFUSED') {
    return {
      type: 'network',
      message: 'Connection refused by server',
      endpoint,
      details: 'The server actively refused the connection. The FTP server may be down or not accepting connections.',
      debugInfo: debugLines.join('\n'),
    };
  }

  // Timeout errors
  if (error.message?.includes('timeout') ||
      error.message?.includes('ETIMEDOUT') ||
      error.code === 'ETIMEDOUT' ||
      error.name === 'AbortError') {
    return {
      type: 'timeout',
      message: 'Request timed out',
      endpoint,
      details: 'The server took too long to respond. This could be due to network congestion or server overload.',
      debugInfo: debugLines.join('\n'),
    };
  }

  // CORS errors
  if (error.message?.includes('CORS') ||
      error.message?.includes('cors') ||
      error.message?.includes('Access-Control-Allow-Origin')) {
    return {
      type: 'cors',
      message: 'Cross-Origin Request Blocked',
      endpoint,
      details: 'The browser blocked this request due to CORS policy. If you\'re on web, try using the proxy server or configure CORS on the FTP server.',
      debugInfo: debugLines.join('\n'),
    };
  }

  // HTTP status code errors
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;

    if (status === 404) {
      return {
        type: 'server',
        message: 'Resource not found',
        endpoint,
        statusCode: 404,
        details: 'The requested resource does not exist on the server. The folder or file may have been moved or deleted.',
        debugInfo: debugLines.join('\n'),
      };
    }

    if (status === 403) {
      return {
        type: 'server',
        message: 'Access forbidden',
        endpoint,
        statusCode: 403,
        details: 'You don\'t have permission to access this resource. Check server permissions.',
        debugInfo: debugLines.join('\n'),
      };
    }

    if (status === 500 || status >= 500) {
      return {
        type: 'server',
        message: 'Internal server error',
        endpoint,
        statusCode: status,
        details: 'The server encountered an error while processing the request. Please try again later.',
        debugInfo: debugLines.join('\n'),
      };
    }

    if (status === 503) {
      return {
        type: 'server',
        message: 'Service unavailable',
        endpoint,
        statusCode: 503,
        details: 'The server is temporarily unavailable. It may be undergoing maintenance or is overloaded.',
        debugInfo: debugLines.join('\n'),
      };
    }

    return {
      type: 'server',
      message: `Server returned error ${status}`,
      endpoint,
      statusCode: status,
      details: error.message || 'An unexpected server error occurred.',
      debugInfo: debugLines.join('\n'),
    };
  }

  // DNS errors
  if (error.message?.includes('ENOTFOUND') ||
      error.code === 'ENOTFOUND') {
    return {
      type: 'network',
      message: 'Server not found',
      endpoint,
      details: 'Could not resolve the server address. Check the server URL and your DNS settings.',
      debugInfo: debugLines.join('\n'),
    };
  }

  // SSL/TLS errors
  if (error.message?.includes('SSL') ||
      error.message?.includes('certificate') ||
      error.message?.includes('TLS')) {
    return {
      type: 'server',
      message: 'SSL/TLS error',
      endpoint,
      details: 'There was a problem with the server\'s SSL certificate. The connection may not be secure.',
      debugInfo: debugLines.join('\n'),
    };
  }

  // Generic/unknown errors
  return {
    type: 'unknown',
    message: error.message || 'An unexpected error occurred',
    endpoint,
    details: 'Something went wrong while processing your request. Please try again.',
    debugInfo: debugLines.join('\n'),
  };
}

/**
 * Format a URL for display (truncate if too long)
 */
export function formatEndpoint(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url;

  const start = url.substring(0, maxLength - 10);
  const end = url.substring(url.length - 7);
  return `${start}...${end}`;
}
