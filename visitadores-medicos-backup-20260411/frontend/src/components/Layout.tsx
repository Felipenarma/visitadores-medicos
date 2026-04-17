import React, { ReactNode } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto w-full">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto pt-16 lg:pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}
