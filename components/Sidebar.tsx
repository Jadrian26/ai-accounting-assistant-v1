
import React from 'react';
import { FolderIcon, SparklesIcon } from './icons';
import { Button } from './Button';

interface SidebarProps {
  activeMainSection: 'media'; 
  onNavigateTo: (section: 'media') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeMainSection,
  onNavigateTo,
}) => {
  const navItemClasses = (section: 'media') =>
    `w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium group relative
     ${activeMainSection === section 
       ? 'bg-slate-700 text-white shadow-inner border-l-4 border-sky-500 pl-[calc(0.75rem-4px)]' // Adjusted padding for border
       : 'text-slate-300 hover:bg-slate-700/80 hover:text-white border-l-4 border-transparent pl-3' // Match padding for alignment
     }`;

  return (
    <div className="w-72 bg-slate-900 text-slate-100 p-5 space-y-6 h-full flex flex-col flex-shrink-0">
      {/* App Title/Logo */}
      <div className="flex items-center space-x-3 px-1 mb-4"> {/* Adjusted padding */}
        <SparklesIcon className="w-8 h-8 text-sky-400 flex-shrink-0" />
        <h1 className="text-2xl font-semibold text-white">AI Accounting Assistant</h1>
      </div>

      {/* Navigation Sections */}
      <nav className="space-y-2">
        <button
          onClick={() => onNavigateTo('media')}
          className={`${navItemClasses('media')} transition-all duration-200 ease-in-out`}
          aria-current={activeMainSection === 'media' ? 'page' : undefined}
        >
          <FolderIcon className="w-5 h-5 flex-shrink-0" />
          <span>Archivos</span>
        </button>
      </nav>

      <div className="mt-auto pt-6 text-center">
        <p className="text-xs text-slate-500">© 2025 AI Accounting Assistant</p>
      </div>
    </div>
  );
};