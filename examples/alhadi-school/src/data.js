export default (() => {
  const teams = [
    { id: 'falcons', name: 'Falcons', letter: 'F', color: '#af3655', motto: 'Rise together.' },
    { id: 'lions', name: 'Lions', letter: 'L', color: '#b89353', motto: 'Heart in every play.' },
    { id: 'knights', name: 'Knights', letter: 'K', color: '#7585a7', motto: 'Stronger as one.' },
    {
      id: 'eagles',
      name: 'Eagles',
      letter: 'E',
      color: '#5a9181',
      motto: 'Eyes on the next possession.',
    },
  ];
  const names = [
    'Adam Rahman',
    'Zayn Ali',
    'Yusuf Malik',
    'Omar Hassan',
    'Sami Noor',
    'Rayyan Aziz',
    'Ibrahim Khan',
    'Hamza Syed',
    'Musa Ahmed',
    'Ali Faris',
    'Bilal Raza',
    'Idris Amin',
    'Hassan Abbas',
    'Isa Karim',
    'Rayan Shah',
    'Zaid Hussain',
    'Daniyal Asif',
    'Ayaan Saleh',
    'Ahmed Saad',
    'Mustafa Hadi',
    'Suleiman Mir',
    'Nuh Qasim',
    'Yahya Zaki',
    'Taha Anwar',
  ];
  const players = names.map((name, i) => ({
    id: 'p' + i,
    name,
    grade: 9 + (i % 4),
    number: [3, 11, 7, 21, 5, 14][i % 6],
    team: teams[Math.floor(i / 6)].id,
    captain: i % 6 === 0,
  }));
  const games = [
    {
      id: 'g1',
      week: 1,
      home: 'falcons',
      away: 'lions',
      homeScore: 54,
      awayScore: 48,
      status: 'final',
      time: '4:00 PM',
    },
    {
      id: 'g2',
      week: 1,
      home: 'knights',
      away: 'eagles',
      homeScore: 42,
      awayScore: 46,
      status: 'final',
      time: '5:00 PM',
    },
    {
      id: 'g3',
      week: 2,
      home: 'falcons',
      away: 'knights',
      homeScore: 51,
      awayScore: 45,
      status: 'final',
      time: '4:00 PM',
    },
    {
      id: 'g4',
      week: 2,
      home: 'lions',
      away: 'eagles',
      homeScore: 49,
      awayScore: 44,
      status: 'final',
      time: '5:00 PM',
    },
    { id: 'g5', week: 3, home: 'falcons', away: 'eagles', status: 'upcoming', time: '4:00 PM' },
    { id: 'g6', week: 3, home: 'lions', away: 'knights', status: 'upcoming', time: '5:00 PM' },
    { id: 'g7', week: 4, home: 'lions', away: 'falcons', status: 'upcoming', time: '4:00 PM' },
    { id: 'g8', week: 4, home: 'eagles', away: 'knights', status: 'upcoming', time: '5:00 PM' },
    { id: 'g9', week: 5, home: 'knights', away: 'falcons', status: 'upcoming', time: '4:00 PM' },
    { id: 'g10', week: 5, home: 'eagles', away: 'lions', status: 'upcoming', time: '5:00 PM' },
    { id: 'g11', week: 6, home: 'eagles', away: 'falcons', status: 'upcoming', time: '4:00 PM' },
    { id: 'g12', week: 6, home: 'knights', away: 'lions', status: 'upcoming', time: '5:00 PM' },
  ];
  const points = {
    g1: [
      [18, 12, 10, 9, 5, 0],
      [16, 12, 8, 6, 4, 2],
    ],
    g2: [
      [12, 10, 8, 6, 4, 2],
      [15, 11, 8, 6, 4, 2],
    ],
    g3: [
      [16, 14, 8, 7, 6, 0],
      [14, 11, 8, 7, 5, 0],
    ],
    g4: [
      [15, 13, 9, 6, 4, 2],
      [14, 10, 8, 6, 4, 2],
    ],
  };
  const box = [];
  games
    .filter((g) => g.status === 'final')
    .forEach((g) =>
      [g.home, g.away].forEach((team, t) =>
        players
          .filter((p) => p.team === team)
          .forEach((p, i) => {
            const dnp = g.id === 'g3' && team === 'knights' && i === 5;
            box.push({
              gameId: g.id,
              playerId: p.id,
              team,
              points: points[g.id][t][i],
              participated: !dnp,
              seconds: dnp
                ? 0
                : g.id === 'g3' && team === 'knights'
                  ? 1920
                  : [1800, 1800, 1680, 1560, 1500, 1260][i],
            });
          }),
      ),
    );
  const applications = [
    ...players.map((p, i) => ({
      id: 'a' + i,
      personId: p.id,
      name: p.name,
      grade: p.grade,
      email: 'student' + (i + 1) + '@example.com',
      review: 'approved',
      placement: 'confirmed',
      payment: 'paid',
      amount: 50,
    })),
    ...['Arman Shah', 'Saif Ali', 'Haroon Asad', 'Zakariya Mir', 'Owais Khan', 'Ilyas Noor'].map(
      (name, i) => ({
        id: 'a' + (i + 24),
        personId: 'p' + (i + 24),
        name,
        grade: 9 + (i % 4),
        email: 'student' + (i + 25) + '@example.com',
        review: i < 4 ? 'pending' : 'approved',
        placement: i < 4 ? 'reserved' : 'waitlist',
        payment: 'paid',
        amount: 50,
      }),
    ),
  ];
  return { teams, players, games, box, applications };
})();
