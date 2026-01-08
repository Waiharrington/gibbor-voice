
import React from 'react';

export const NavIcon = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
    <div onClick={onClick} className="group flex flex-col items-center gap-1 cursor-pointer w-full p-2 rounded-xl transition-all hover:bg-gray-100">
        <div className={`
             w-12 h-8 flex items-center justify-center rounded-full transition-all duration-300
             ${active ? 'bg-blue-100 text-blue-700' : 'text-gray-500 group-hover:text-gray-700'}
        `}>
            {icon}
        </div>
        {/* Tooltip-like label for rail? Or explicit label? */}
        {/* Google just uses icons often, or minimal labels. Let's keep it clean. */}
    </div>
);
