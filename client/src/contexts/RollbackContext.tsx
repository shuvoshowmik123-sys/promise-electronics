import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface RollbackRequest {
  id: string;
  ticketNumber: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  requestedBy: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'denied';
  pipeline: 'admin' | 'tracking';  // Which pipeline the rollback is for
}

interface RollbackContextType {
  rollbackRequests: RollbackRequest[];
  addRollbackRequest: (request: Omit<RollbackRequest, 'id' | 'requestedAt' | 'status'>) => void;
  approveRollback: (id: string) => void;
  denyRollback: (id: string) => void;
  getPendingRollbacks: () => RollbackRequest[];
  getApprovedRollbacks: () => RollbackRequest[];
  getDeniedRollbacks: () => RollbackRequest[];
}

const RollbackContext = createContext<RollbackContextType | undefined>(undefined);

export function RollbackProvider({ children }: { children: ReactNode }) {
  const [rollbackRequests, setRollbackRequests] = useState<RollbackRequest[]>([]);

  const addRollbackRequest = useCallback((request: Omit<RollbackRequest, 'id' | 'requestedAt' | 'status'>) => {
    const newRequest: RollbackRequest = {
      ...request,
      id: `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      requestedAt: new Date(),
      status: 'pending',
    };
    setRollbackRequests(prev => [newRequest, ...prev]);
  }, []);

  const approveRollback = useCallback((id: string) => {
    setRollbackRequests(prev =>
      prev.map(req =>
        req.id === id ? { ...req, status: 'approved' as const } : req
      )
    );
  }, []);

  const denyRollback = useCallback((id: string) => {
    setRollbackRequests(prev =>
      prev.map(req =>
        req.id === id ? { ...req, status: 'denied' as const } : req
      )
    );
  }, []);

  const getPendingRollbacks = useCallback(() => {
    return rollbackRequests.filter(req => req.status === 'pending');
  }, [rollbackRequests]);

  const getApprovedRollbacks = useCallback(() => {
    return rollbackRequests.filter(req => req.status === 'approved');
  }, [rollbackRequests]);

  const getDeniedRollbacks = useCallback(() => {
    return rollbackRequests.filter(req => req.status === 'denied');
  }, [rollbackRequests]);

  return (
    <RollbackContext.Provider value={{
      rollbackRequests,
      addRollbackRequest,
      approveRollback,
      denyRollback,
      getPendingRollbacks,
      getApprovedRollbacks,
      getDeniedRollbacks,
    }}>
      {children}
    </RollbackContext.Provider>
  );
}

export function useRollback() {
  const context = useContext(RollbackContext);
  if (context === undefined) {
    throw new Error('useRollback must be used within a RollbackProvider');
  }
  return context;
}
