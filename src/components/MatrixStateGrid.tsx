import { cn } from '@/lib/utils';
import { type MatrixState, RAW_STATE_CONFIG } from '@/lib/dev-config';

interface MatrixStateGridProps {
  matrixState: MatrixState | null;
  rows?: number;
  cols?: number;
  className?: string;
}

/**
 * Visual grid showing button matrix electrical connections
 * Displays row/column intersections with connection status
 */
export function MatrixStateGrid({ 
  matrixState, 
  rows = 4, 
  cols = 4, 
  className 
}: MatrixStateGridProps) {
  if (!matrixState) {
    return (
      <div className={cn("matrix-state-grid", className)}>
        <div className="text-center text-gray-500 py-4">
          <p className="text-sm">Matrix not configured or no data available</p>
        </div>
      </div>
    );
  }

  // Create a lookup for quick connection checking
  const connectionMap = new Map<string, boolean>();
  matrixState.connections.forEach(conn => {
    connectionMap.set(`${conn.row}-${conn.col}`, conn.is_connected);
  });

  return (
    <div className={cn("matrix-state-grid overflow-auto", className)}>
      <div className="inline-block min-w-max">
        <table className="border-collapse bg-white rounded-lg shadow-sm">
          <thead>
            <tr>
              <th className="p-2 text-xs font-medium text-gray-500 border-b border-gray-200">
                {/* Empty corner cell */}
              </th>
              {Array.from({ length: cols }, (_, i) => (
                <th 
                  key={i} 
                  className="p-2 text-xs font-medium text-gray-500 text-center border-b border-gray-200 min-w-[60px]"
                >
                  COL{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, rowIdx) => (
              <tr key={rowIdx}>
                <td className="p-2 text-xs font-medium text-gray-500 border-r border-gray-200">
                  ROW{rowIdx}
                </td>
                {Array.from({ length: cols }, (_, colIdx) => {
                  const isConnected = connectionMap.get(`${rowIdx}-${colIdx}`) || false;
                  
                  return (
                    <td key={colIdx} className="p-2 text-center border border-gray-100">
                      <div 
                        className={cn(
                          "w-8 h-8 rounded-full transition-all duration-150 mx-auto",
                          "flex items-center justify-center text-xs font-medium",
                          "border-2",
                          isConnected 
                            ? "bg-green-500 text-white border-green-600 scale-110 shadow-md" 
                            : "bg-gray-50 border-gray-300 hover:bg-gray-100"
                        )}
                        title={`Row ${rowIdx}, Col ${colIdx}: ${isConnected ? 'Connected' : 'Open'}`}
                      >
                        {isConnected && (
                          <span className="text-white font-bold">●</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        
        {RAW_STATE_CONFIG.showTimestamps && matrixState.timestamp && (
          <div className="mt-2 text-xs text-gray-500 text-center">
            Last update: {new Date(matrixState.timestamp / 1000).toLocaleTimeString()}
          </div>
        )}
      </div>
      
      {/* Connection summary */}
      <div className="mt-3 text-xs text-gray-600">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Connected ({matrixState.connections.filter(c => c.is_connected).length})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            <span>Open ({matrixState.connections.filter(c => !c.is_connected).length})</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simplified matrix display for compact spaces
interface CompactMatrixDisplayProps {
  matrixState: MatrixState | null;
  className?: string;
}

export function CompactMatrixDisplay({ matrixState, className }: CompactMatrixDisplayProps) {
  if (!matrixState) {
    return (
      <div className={cn("compact-matrix-display", className)}>
        <span className="text-gray-500 text-sm">No matrix data</span>
      </div>
    );
  }

  const connectedCount = matrixState.connections.filter(c => c.is_connected).length;
  const totalCount = matrixState.connections.length;

  return (
    <div className={cn("compact-matrix-display flex items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="text-sm font-medium">{connectedCount}</span>
      </div>
      <span className="text-gray-400">/</span>
      <span className="text-sm text-gray-600">{totalCount}</span>
      <span className="text-xs text-gray-500">active</span>
    </div>
  );
}