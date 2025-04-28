"use client";

// import Image from 'next/image';
import { MdClose } from 'react-icons/md';
import { FaCheck } from 'react-icons/fa6';

import CustomButton from './CustomButton';

// import swiper components
import { Swiper, SwiperSlide } from 'swiper/react';;

// import required modules
import { Pagination } from 'swiper/modules';

// swiper styles
import 'swiper/css';
import 'swiper/css/pagination'

const membershipData = [
    {
        title: 'Standard',
        price: '30',
        benefits: [
            {
                icon: FaCheck,
                text: 'Includes membership',
            },
            {
                icon: FaCheck,
                text: 'Access to all gym facilities',
            },
            {
                icon: MdClose,
                text: 'Diet plan included',
            },
            {
                icon: FaCheck,
                text: 'Health and fitness tips',
            },
            {
                icon: MdClose,
                text: 'Monday-Friday gym access',
            },
            {
                icon: FaCheck,
                text: 'Full access to everything',
            },
            {
                icon: MdClose,
                text: 'No additional amenities',
            },
        ]
    },
    {
        title: 'Ultimate',
        price: '45',
        benefits: [
            {
                icon: FaCheck,
                text: 'Includes membership',
            },
            {
                icon: FaCheck,
                text: 'Access to all gym facilities',
            },
            {
                icon: FaCheck,
                text: 'Diet plan included',
            },
            {
                icon: FaCheck,
                text: 'Health and fitness tips',
            },
            {
                icon: FaCheck,
                text: 'Monday-Friday gym access',
            },
            {
                icon: FaCheck,
                text: 'Full access to everything',
            },
            {
                icon: MdClose,
                text: 'No additional amenities',
            },
        ]
    },
    {
        title: 'Professional',
        price: '60',
        benefits: [
            {
                icon: FaCheck,
                text: 'Includes membership',
            },
            {
                icon: FaCheck,
                text: 'Access to all gym facilities',
            },
            {
                icon: FaCheck,
                text: 'Diet plan included',
            },
            {
                icon: FaCheck,
                text: 'Health and fitness tips',
            },
            {
                icon: FaCheck,
                text: 'Monday-Friday gym access',
            },
            {
                icon: FaCheck,
                text: 'Full access to everything',
            },
            {
                icon: FaCheck,
                text: 'No additional amenities',
            },
        ]
    },
]

const MembershipSlider = () => {
    return (
        <Swiper 
          slidesPerView={1}
          modules={[Pagination]}
          pagination={{
            clickable: true,
          }}
          breakpoints={{
            760: {
                slidesPerView: 2,
                spaceBetween: 30,
            },
            1024: {
                slidesPerView: 3,
                spaceBetween: 30,
            },
          }}
          className='min-h-[680px]'
        >
            {membershipData.map((item, index) => {
                return (
                    <SwiperSlide key={index}>
                    <div className='border border-accent hover:bg-primary-300/80 transition-all duration-300 
                    w-full max-w-sm xl:max-w-none mx-auto'>
                        <div className='py-5 px-[60px] border-b border-accent'>
                          <h4 className='h4'>{item.title}</h4>
                        </div>
                        {/* benefits */}
                        <div className='py-[30px] px-[60px]'>
                            <ul className='flex flex-col gap-5 mb-7'>
                              {item.benefits.map((item, index) => {
                                return (
                                  <li className='flex items-center gap-2' key={index}>
                                    <item.icon className='text-accent text-lg' />
                                    {item.text}
                                  </li>
                                )
                              })}
                            </ul>
                            {/* price & button */}
                            <p className='text-accent mb-8 flex gap-1 items-center'>
                              <sup className='text-4xl'>$</sup>
                              <strong className='text-6xl'>{item.price}</strong>
                              <em className='self-end text-2xl'>/month</em>
                            </p>
                            <CustomButton 
                              containerStyles='w-[196px] h-[62px]' 
                              text='Buy now' 
                            />
                        </div>
                    </div>
                    </SwiperSlide>
                )
            })}
        </Swiper>
    )
};

export default MembershipSlider;