'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Dialpad from '@/components/Dialpad';
import { Device } from '@twilio/voice-sdk';
import { PhoneOff, Mic, MicOff } from 'lucide-react';

export default function Home() {
  const [device, setDevice] = useState<Device | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<string>('Idle');
  const [identity, setIdentity] = useState<string>('');

  // Fetch token on mount
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch('http://localhost:3001/token');
        const data = await response.json();
        setToken(data.token);
        setIdentity(data.identity);
        console.log('Token fetched for identity:', data.identity);
      } catch (error) {
        console.error('Error fetching token:', error);
      }
    };

    fetchToken();
  }, []);

  // Initialize Device when token is available
  useEffect(() => {
    if (token && !device) {
      const newDevice = new Device(token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'],
      });

      newDevice.on('registered', () => {
        console.log('Twilio Device Registered');
        setCallStatus('Ready');
      });

      newDevice.on('error', (error) => {
        console.error('Twilio Device Error:', error);
        setCallStatus('Error: ' + error.message);
      });

      newDevice.on('incoming', (call) => {
        setCallStatus('Incoming Call...');
        setActiveCall(call);

        call.on('disconnect', () => {
          setActiveCall(null);
          setCallStatus('Ready');
        });
      });

      newDevice.register();
      setDevice(newDevice);
    }

    return () => {
      if (device) {
        device.destroy();
      }
    };
  }, [token, device]);

  const handleCall = async (number: string) => {
    if (!device) return;

    try {
      setCallStatus('Calling ' + number + '...');
      const call = await device.connect({ params: { To: number } });

      call.on('accept', () => {
        setCallStatus('In Call: ' + number);
        setActiveCall(call);
      });

      call.on('disconnect', () => {
        setCallStatus('Ready');
        setActiveCall(null);
        setIsMuted(false);
      });

      call.on('error', (error: any) => {
        console.error('Call Error:', error);
        setCallStatus('Call Error');
        setActiveCall(null);
      });

    } catch (error) {
      console.error('Error making call:', error);
      setCallStatus('Error making call');
    }
  };

  const handleHangup = () => {
    if (activeCall) {
      activeCall.disconnect();
    }
  };

  const toggleMute = () => {
    if (activeCall) {
      const newMuted = !isMuted;
      activeCall.mute(newMuted);
      setIsMuted(newMuted);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />

      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 flex items-center justify-between px-8 bg-white">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-800">Calls</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${callStatus === 'Ready' ? 'bg-green-100 text-green-700' :
                callStatus.startsWith('Error') ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
              }`}>
              {callStatus}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            Logged in as: <span className="font-medium text-gray-700">{identity || 'Loading...'}</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center bg-gray-50 p-8">

          {activeCall ? (
            // Active Call Interface
            <div className="bg-white rounded-2xl shadow-lg p-8 w-96 text-center animate-in fade-in zoom-in duration-300">
              <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-6 flex items-center justify-center text-3xl font-bold text-gray-500">
                #
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                {activeCall.parameters?.To || 'Unknown'}
              </h2>
              <p className="text-green-600 font-medium mb-8 animate-pulse">
                {callStatus}
              </p>

              <div className="flex items-center justify-center space-x-6">
                <button
                  onClick={toggleMute}
                  className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                <button
                  onClick={handleHangup}
                  className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
              </div>
            </div>
          ) : (
            // Dialpad View
            <div className="flex flex-col items-center space-y-8">
              <Dialpad onCall={handleCall} />
              <p className="text-sm text-gray-400">
                Make sure your microphone is allowed.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
