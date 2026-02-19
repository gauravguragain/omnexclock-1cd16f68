import React, { createContext, useContext, useState, useCallback, useRef } from "react";

interface ActionLockContextType {
  isLocked: boolean;
  runAction: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

const ActionLockContext = createContext<ActionLockContextType>({
  isLocked: false,
  runAction: async () => undefined,
});

export const useActionLock = () => useContext(ActionLockContext);

export const ActionLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLocked, setIsLocked] = useState(false);
  const lockRef = useRef(false);

  const runAction = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lockRef.current) return undefined;
    lockRef.current = true;
    setIsLocked(true);
    try {
      return await fn();
    } finally {
      lockRef.current = false;
      setIsLocked(false);
    }
  }, []);

  return (
    <ActionLockContext.Provider value={{ isLocked, runAction }}>
      {children}
      {isLocked && (
        <div
          className="fixed inset-0 z-[9999] cursor-wait"
          style={{ pointerEvents: "auto" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        />
      )}
    </ActionLockContext.Provider>
  );
};
