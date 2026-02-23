
'use client';

import { useState, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';

export default function AudioPlayer({ src }: { src: string }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        audioRef.current = new Audio(src);

        audioRef.current.addEventListener('loadedmetadata', () => {
            setDuration(audioRef.current?.duration || 0);
        });

        audioRef.current.addEventListener('timeupdate', () => {
            setProgress(audioRef.current?.currentTime || 0);
        });

        audioRef.current.addEventListener('ended', () => {
            setIsPlaying(false);
            setProgress(0);
            if (audioRef.current) audioRef.current.currentTime = 0;
        });

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        }
    }, [src]);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = Number(e.target.value);
        if (audioRef.current) audioRef.current.currentTime = newTime;
        setProgress(newTime);
    };

    const formatTime = (time: number) => {
        if (!time || isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <div className="mt-4 bg-gray-50 rounded-xl p-3 flex items-center space-x-3 border border-gray-100">
            <button
                onClick={togglePlay}
                className="w-8 h-8 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-gray-700 transition-colors shrink-0"
                aria-label={isPlaying ? "Pause" : "Play"}
            >
                {isPlaying ? (
                    <div className="h-3 w-3 bg-white rounded-sm" />
                ) : (
                    <div className="w-0 h-0 border-t-4 border-t-transparent border-l-8 border-l-white border-b-4 border-b-transparent ml-1" />
                )}
            </button>

            <div className="flex-1 flex flex-col justify-center">
                <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={progress}
                    onChange={handleSeek}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
                />
            </div>

            <span className="text-xs text-gray-500 font-medium tabular-nums min-w-[32px]">
                {formatTime(duration)}
            </span>
        </div>
    );
}
