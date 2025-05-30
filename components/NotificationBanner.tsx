

import React, { useEffect } from 'react';
import { NotificationContent } from '../types';
import { CheckCircleIcon, XCircleIcon, InfoCircleIcon, XMarkIcon } from './icons';

interface NotificationBannerProps {
  notification: NotificationContent | null;
  onDismiss: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({ notification, onDismiss }) => {
  if (!notification) return null;

  const { type, message, title } = notification;

  let bgColor = 'bg-sky-500';
  let textColor = 'text-white';
  let IconComponent = InfoCircleIcon;

  switch (type) {
    case 'success':
      bgColor = 'bg-green-500';
      IconComponent = CheckCircleIcon;
      break;
    case 'error':
      bgColor = 'bg-red-600';
      IconComponent = XCircleIcon;
      break;
    case 'info':
      bgColor = 'bg-slate-700'; // Or sky-600 for more blue
      IconComponent = InfoCircleIcon;
      break;
  }

  return (
    <div 
      role="alert"
      aria-live="assertive"
      className={`fixed top-5 left-1/2 transform -translate-x-1/2 w-full max-w-md md:max-w-lg z-[100] p-1 transition-all duration-300 ease-in-out animate-slideDownFadeIn`}
    >
      <div className={`relative ${bgColor} ${textColor} rounded-lg shadow-2xl p-4 flex items-start space-x-3`}>
        <div className="flex-shrink-0 pt-0.5">
          <IconComponent className="w-6 h-6" />
        </div>
        <div className="flex-1">
          {title && <h3 className="text-sm font-semibold mb-0.5">{title}</h3>}
          <p className="text-sm">{message}</p>
        </div>
        <button
          onClick={onDismiss}
          className={`ml-auto -mr-1 -mt-1 p-1.5 rounded-full ${textColor} opacity-80 hover:opacity-100 hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-opacity`}
          aria-label="Cerrar notificación"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      {/* Removed jsx prop from style tag to fix TypeScript error. This syntax is specific to frameworks like Next.js. */}
      <style>{`
        @keyframes slideDownFadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-slideDownFadeIn {
          animation: slideDownFadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};