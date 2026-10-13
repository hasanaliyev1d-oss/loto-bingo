const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {}; 

io.on('connection', (socket) => {
    console.log('Bir istifadəçi qoşuldu:', socket.id);

    // Otağa qoşulma sorğusu
    socket.on('join_room', ({ username, roomId, balance }) => {
        // Otaq kodunun mütləq 666 olmasını yoxlayırıq
        if (roomId !== '666') {
            socket.emit('error_msg', 'Yanlış otaq kodu! Doğru kodu daxil edin.');
            return;
        }

        if (!rooms['666']) {
            rooms['666'] = {
                players: [],
                allNumbers: Array.from({length: 90}, (_, i) => i + 1),
                drawnNumbers: [],
                status: 'waiting',
                pot: 0,
                gameInterval: null
            };
        }

        let room = rooms['666'];
        
        if (room.status === 'playing') {
            socket.emit('error_msg', 'Oyun artıq başlayıb!');
            return;
        }

        if (room.players.length >= 6) {
            socket.emit('error_msg', 'Otaq doludur! Maksimum 6 nəfər oynaya bilər.');
            return;
        }

        if (balance < 0.50) {
            socket.emit('error_msg', 'Balansınızda kifayət qədər məbləğ yoxdur! Zəhmət olmasa depozit edin.');
            return;
        }

        socket.join(roomId);

        room.players.push({
            id: socket.id,
            username: username,
            card: generateBingoCard(),
            matched: []
        });

        room.pot += 0.50; 

        io.to(roomId).emit('update_room', { room, newBalance: balance - 0.50 });
    });

    // Oyunu başlat
    socket.on('start_game', (roomId) => {
        let room = rooms[roomId];
        if (!room || room.status === 'playing') return;

        room.status = 'playing';
        io.to(roomId).emit('game_started', room);

        room.gameInterval = setInterval(() => {
            if (room.allNumbers.length === 0) {
                clearInterval(room.gameInterval);
                io.to(roomId).emit('game_over', { winner: null, message: 'Rəqəmlər bitdi, heç-heçə!' });
                return;
            }

            let randomIndex = Math.floor(Math.random() * room.allNumbers.length);
            let drawn = room.allNumbers.splice(randomIndex, 1)[0];
            room.drawnNumbers.push(drawn);

            io.to(roomId).emit('new_number', { drawn, drawnNumbers: room.drawnNumbers });

            for (let player of room.players) {
                if (player.card.flat().every(num => num === 0 || room.drawnNumbers.includes(num))) {
                    clearInterval(room.gameInterval);
                    let commission = room.pot * 0.10; 
                    let winnings = room.pot - commission;
                    
                    io.to(roomId).emit('game_over', {
                        winner: player.username,
                        winnerId: player.id,
                        winnings: winnings.toFixed(2),
                        pot: room.pot.toFixed(2)
                    });
                    
                    room.status = 'ended';
                    break;
                }
            }
        }, 3000);
    });

    socket.on('disconnect', () => {
        console.log('İstifadəçi çıxdı:', socket.id);
        for (let roomId in rooms) {
            let room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                clearInterval(room.gameInterval);
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('update_room', { room });
            }
        }
    });
});

function generateBingoCard() {
    let card = Array(3).fill(0).map(() => Array(9).fill(0));
    for (let col = 0; col < 9; col++) {
        let min = col * 10 + 1;
        let max = col === 8 ? 90 : (col + 1) * 10;
        let colNums = [];
        while (colNums.length < 2) {
            let num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!colNums.includes(num)) colNums.push(num);
        }
        colNums.sort((a, b) => a - b);
        card[0][col] = colNums[0];
        card[1][col] = colNums[1];
    }
    return card;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server işləyir: http://localhost:${PORT}`));
                                             
