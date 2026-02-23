
'use client';

import { useState, useEffect } from 'react';

export interface UsePhoneNumbersProps {
    userId: string | null;
    apiBaseUrl: string;
}

export function usePhoneNumbers({ userId, apiBaseUrl }: UsePhoneNumbersProps) {
    const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
    const [selectedCallerId, setSelectedCallerId] = useState<string>('');
    const [callbackNumber, setCallbackNumber] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function fetchNumbers() {
            if (!userId) return;
            try {
                setIsLoading(true);
                const res = await fetch(`${apiBaseUrl}/phone-numbers?userId=${userId}`);
                if (res.ok) {
                    const data = await res.json();
                    const nums = data.numbers || [];
                    setAvailableNumbers(nums);
                    setCallbackNumber(data.callbackNumber || null);

                    const stored = localStorage.getItem('gibbor_caller_id');
                    const isValidStored = stored && nums.some((n: any) => n.phoneNumber === stored);

                    if (isValidStored) {
                        setSelectedCallerId(stored!);
                    } else if (data.callbackNumber && nums.some((n: any) => n.phoneNumber === data.callbackNumber)) {
                        setSelectedCallerId(data.callbackNumber);
                    } else if (nums.length > 0) {
                        setSelectedCallerId(nums[0].phoneNumber);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch numbers:", e);
            } finally {
                setIsLoading(false);
            }
        }
        fetchNumbers();
    }, [userId, apiBaseUrl]);

    const selectCallerId = (id: string) => {
        setSelectedCallerId(id);
        localStorage.setItem('gibbor_caller_id', id);
    };

    return { availableNumbers, selectedCallerId, callbackNumber, selectCallerId, isLoading };
}
