import React from 'react';
import { useVoiceCall } from '../../hooks/useVoiceCall';
import { PhoneOff } from 'lucide-react';

export const CallManager = () => {
    const { callState, activeCall, acceptCall, endCall, remoteAudioRef } = useVoiceCall();

    if (callState === 'idle') return null;

    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
            <audio ref={remoteAudioRef} autoPlay playsInline />
            {callState === 'ringing-outgoing' && (
                <div className="text-center space-y-4">
                    <h2 className="text-xl font-bold">Calling...</h2>
                    <button onClick={endCall} className="p-4 bg-red-500 text-white rounded-full">
                        <PhoneOff size={32} />
                    </button>
                </div>
            )}
            {callState === 'ringing-incoming' && (
                <div className="text-center space-y-4">
                    <h2 className="text-xl font-bold">Incoming Call</h2>
                    <div className="flex gap-4">
                        <button onClick={acceptCall} className="p-4 bg-green-500 text-white rounded-full">Accept</button>
                        <button onClick={endCall} className="p-4 bg-red-500 text-white rounded-full">Decline</button>
                    </div>
                </div>
            )}
             {callState === 'connected' && (
                <div className="text-center space-y-4">
                    <h2 className="text-xl font-bold">Connected</h2>
                    <button onClick={endCall} className="p-4 bg-red-500 text-white rounded-full">
                        <PhoneOff size={32} />
                    </button>
                </div>
            )}
        </div>
    );
};
