"use client"

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Adjust path if needed
import HeroSlider from './HeroSlider';

const Hero = () => {
    const [testData, setTestData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchTestData = async () => {
            const { data, error } = await supabase.from('your_table_name').select('*'); 
            
            if (error) {
                setError(error.message);
                console.error('Supabase error:', error);
            } else {
                setTestData(data);
                console.log('Supabase data:', data);
            }
        };

        fetchTestData();
    }, []);

    return (
        <section 
          className="h-[80vh] lg:h-[912px] bg-hero bg-cover bg-center bg-no-repeat" 
          id="home">
            <div className="container mx-auto h-full">
                {/* slider */}
                <HeroSlider />
                
                {/* Test Display */}
                <div className="text-white text-center mt-8">
                    {error ? (
                        <p className="text-red-500">Error: {error}</p>
                    ) : testData ? (
                        <p>Connected! Found {testData.length} rows in your_table_name.</p>
                    ) : (
                        <p>Loading...</p>
                    )}
                </div>
            </div>
        </section>
    );
};

export default Hero;