import type { Trip } from '../types';

export const SAMPLE_TRIPS: Trip[] = [
  {
    id: 'trip_sample_kyoto',
    title: '京都慢行三日',
    destination: '日本・京都',
    startDate: '2026-04-10',
    endDate: '2026-04-12',
    cover: 'forest',
    coverImage:
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80',
    notes: '櫻花季前夕，避開人潮，以步行與公車為主。',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    days: [
      {
        date: '2026-04-10',
        activities: [
          {
            id: 'act_1',
            title: '抵達京都站',
            place: '京都駅',
            time: '10:30',
            category: 'transit',
            notes: '搭乘新幹線，出站後寄放行李。',
            imageUrl:
              'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'act_2',
            title: '清水寺與二年坂',
            place: '清水寺 京都',
            time: '13:00',
            category: 'sight',
            notes: '午後光線柔和，適合拍照。',
            imageUrl:
              'https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'act_3',
            title: '寧寧小路晚餐',
            place: '祇園 京都',
            time: '18:30',
            category: 'food',
            notes: '預約京會席或蕎麥麵。',
            imageUrl:
              'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80',
          },
        ],
      },
      {
        date: '2026-04-11',
        activities: [
          {
            id: 'act_4',
            title: '嵐山竹林',
            place: '嵐山竹林 京都',
            time: '08:00',
            category: 'sight',
            notes: '早到避開人潮。',
            imageUrl:
              'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'act_5',
            title: '天龍寺庭園',
            place: '天龍寺 京都',
            time: '10:00',
            category: 'sight',
            notes: '',
            imageUrl:
              'https://images.unsplash.com/photo-1478436127897-769e1b3f0f56?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'act_6',
            title: '入住旅宿',
            place: '四条烏丸 京都',
            time: '16:00',
            category: 'stay',
            notes: '可步行至錦市場。',
          },
        ],
      },
      {
        date: '2026-04-12',
        activities: [
          {
            id: 'act_7',
            title: '伏見稻荷大社',
            place: '伏見稲荷大社',
            time: '07:30',
            category: 'sight',
            notes: '清晨千本鳥居最清幽。',
            imageUrl:
              'https://images.unsplash.com/photo-1478436127897-769e1b3f0f56?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'act_8',
            title: '返程',
            place: '京都駅',
            time: '14:00',
            category: 'transit',
            notes: '',
          },
        ],
      },
    ],
  },
  {
    id: 'trip_sample_hualien',
    title: '花蓮海岸週末',
    destination: '台灣・花蓮',
    startDate: '2026-05-16',
    endDate: '2026-05-17',
    cover: 'coast',
    coverImage:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    notes: '輕裝兩日，重點放在海岸與慢食。',
    createdAt: '2026-03-05T08:00:00.000Z',
    updatedAt: '2026-03-05T08:00:00.000Z',
    days: [
      {
        date: '2026-05-16',
        activities: [
          {
            id: 'act_h1',
            title: '七星潭晨走',
            place: '七星潭 花蓮',
            time: '07:00',
            category: 'sight',
            notes: '聽浪、看日出。',
            imageUrl:
              'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
          },
          {
            id: 'act_h2',
            title: '東大門夜市',
            place: '東大門夜市 花蓮',
            time: '18:00',
            category: 'food',
            notes: '炸物與飲料適量就好。',
            imageUrl:
              'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80',
          },
        ],
      },
      {
        date: '2026-05-17',
        activities: [
          {
            id: 'act_h3',
            title: '太魯閣入口散步',
            place: '太魯閣國家公園',
            time: '09:00',
            category: 'sight',
            notes: '視天氣決定路線長度。',
            imageUrl:
              'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80',
          },
        ],
      },
    ],
  },
];
