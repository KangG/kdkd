const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const multer = require('multer')
const session = require('express-session');

const app = express();
const http = require('http').Server(app);
//var upload = multer({ dest: 'uploads/' });

app.locals.pretty = true;
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: '@#@$MYSIGN#@$#$',
    resave: false,
    saveUninitialized: true
}));

app.use(function (req, res, next) {
    req.session.userid = 'admin';
    req.session.name = '관리자';
    req.session.grade = 'A';
    res.locals.user = req.session;
    res.locals.menu = req.url.split('/')[1];
    let submenu = req.url.split('/')[2];
    if(!req.session.userid && !req.session.passport && !(res.locals.menu == 'user')) {
        return res.redirect('/user/login');
    }
    if(req.session.grade == 'N' && !(res.locals.menu == 'user' && submenu == 'user_student_add')) {
        return res.redirect('/user/user_student_add');
    }
    next();
});

app.set('views', './views');
app.set('view engine', 'ejs');

//-----------DB------------------
const pool = mysql.createPool({
    host: '183.101.196.138',
    user: 'kdkd',
    password: 'kdkd',
    database: 'kdkd',
    port: 3306,
    connectionLimit: 20,
    waitForConnection: false
});
http.listen(8888, () => {
    console.log('8888 port opened!!!');
})
//-----------DB------------------

//--------------Web Cam---------------
const path = require('path');
var io = require("socket.io")(http);
io.on('connection',function(socket){
    socket.on('stream',function(image){
      socket.broadcast.emit('stream',image);
    });
  });
//--------------Web Cam---------------

//------------naver login-------------
var passport = require('passport');

app.use(passport.initialize());
app.use(passport.session());
//------------naver login-------------


app.use('/user', require('./routes/user.js'));
app.use('/notice', require('./routes/notice.js'));
app.use('/board', require('./routes/board.js'));
app.use('/calendar', require('./routes/calendar.js'));
app.use('/inout', require('./routes/inout.js'));
app.use('/admin', require('./routes/admin.js'));

//////////////////////////////////////////////////////////////
//                      HOME                                //
//////////////////////////////////////////////////////////////

app.get(['/', '/home'], (req, res) => {
    const sess = req.session;
    let userid = sess.userid;

    let select_environment = `
    select date_format(time, '%H:%i') t, temperature, humidity, dust from environment
    order by time desc
    limit 0,10
    `;
    let select_board = `
    select b.id as id, u.name as name, b.title as title, b.content as content, 
    case
    when date_format(b.time, '%Y-%m-%d')=date_format(now(), '%Y-%m-%d')
    then date_format(b.time, '%H:%i:%s')
    else date_format(b.time, '%Y-%m-%d')
    end as time, b.hit as hit
    from board b, user u
    where b.writer_id = u.id
    order by b.time desc
    limit 0, 5
    `;
    let inout_query = `
    select s.id as id, s.name as name, io.in_out_flag, t.time
    from 
    relation r inner join student s on r.student_id = s.id
    left outer join (select student_id, max(time) as time
    from in_out
    where date_format(time, '%Y-%m-%d')=date_format(now(), '%Y-%m-%d')
    group by student_id
    ) t
    on s.id = t.student_id
    left outer join in_out io on io.time = t.time
    where r.parents_id = ?
    `;
    
    pool.getConnection((err, connection) => {
        connection.query(select_environment, (err, environment_results) => {
            if (err) {
                console.log(err);
                connection.release();
                res.status(500).send('Internal Server Error!!!')
            }
            connection.query(select_board, (err, board_results) => {
                if (err) {
                    console.log(err);
                    connection.release();
                    res.status(500).send('Internal Server Error!!!')
                }
                connection.query(inout_query, userid, (err, inout_results) => {
                    if (err) {
                        console.log(err);
                        connection.release();
                        res.status(500).send('Internal Server Error!!!')
                    }
                    connection.release();
                    var msg = "";
                    for(let i=0; i<inout_results.length; i++){ 
                        msg += inout_results[i].name;
                        if(inout_results[i].in_out_flag == "in") msg += " 등원";
                        else if(inout_results[i].in_out_flag == "out") msg += " 하원";
                        else msg += " 미등원";
                        if(i != inout_results.length-1) {
                            msg +=",  ";
                        }
                    }
                    sess.msg = msg;
                    
                    res.render('home', { environments: environment_results, boards: board_results });
                });
            });
        });
    });
});

app.get('/streamer', (req, res) => res.sendFile(path.resolve(__dirname, './views/streamer.html')));

//////////////////////////////////////////////////////////////
//                      채팅                                //
//////////////////////////////////////////////////////////////

app.get('/chat', (req, res) => {
    let name = req.session.name;
    let classname;
    if(req.query.class != undefined) classname = req.query.class;
    else classname = "전체";
    res.render('chat', {name: name, classname: classname});
});

const chat = io.of('chat')
chat.on('connection', (socket) => {
    socket.on('leaveRoom', (classname, name) => {
        socket.leave(classname, () => {
            chat.to(classname).emit('leaveRoom', classname, name);
        });
    });

    socket.on('joinRoom', (classname, name) => {
        socket.join(classname, () => {
            chat.to(classname).emit('joinRoom', classname, name);
        });
    });

    socket.on('chat message', (classname, name, msg) => {
        chat.to(classname).emit('chat message', name, msg);
    });

    socket.on('disconnect', () => {
    });
});

//////////////////////////////////////////////////////////////
//               error page (무조건 맨밑!!)                  //
//////////////////////////////////////////////////////////////

// app.use(function (req, res, next) {
//     throw new Error(req.url + ' not found');
// });

// app.use(function (err, req, res, next) {
//     res.status(500);
//     res.render('errpage');
// });