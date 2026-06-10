import { useState, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, push, set, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ──────────────────────────────────────────────────────────
// 🔥 Firebase設定
// ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCmK4gTeVbhD25b-tnF8EzKEL42_27NLqE",
  authDomain: "line-calendar-bf7db.firebaseapp.com",
  databaseURL: "https://line-calendar-bf7db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "line-calendar-bf7db",
  storageBucket: "line-calendar-bf7db.firebasestorage.app",
  messagingSenderId: "716210439011",
  appId: "1:716210439011:web:5729ec083ae2c29e154956"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ──────────────────────────────────────────────────────────
// 📱 LIFF設定
// ──────────────────────────────────────────────────────────
const LIFF_ID = "2010319877-oIjxK70W";

// ──────────────────────────────────────────────────────────
// 👥 グループ識別子（Firebaseのデータ保存パス）
// stingerサークル用: "line-attendance-circle"
// stinger女子用:     "line-attendance"
// ──────────────────────────────────────────────────────────
const GROUP_PATH = "line-attendance"; // ← このファイルに応じて変更

// ──────────────────────────────────────────────────────────
// 🔑 管理者権限を持つLINEユーザーIDのリスト
// LINE Developers コンソール or liff.getProfile() で確認できる userId を追加
// ──────────────────────────────────────────────────────────
const ADMIN_USER_IDS = [
  "Ub38755772c803258b4321f268dab48ed", // 管理者1
  "kosuke9803", // 管理者2（複数人可）
];

// ──────────────────────────────────────────────────────────
const TODAY = new Date();
const EVENT_COLORS = ["#00B900","#3B82F6","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6"];
const STATUS_META = {
  参加: { bg: "#00B900", light: "#e6f9e6", icon: "✅" },
  欠席: { bg: "#EF4444", light: "#fee2e2", icon: "❌" },
  未定: { bg: "#9CA3AF", light: "#f3f4f6", icon: "🤔" },
};

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}
function toLocalDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function fmt(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getMonth()+1}/${dt.getDate()}(${["日","月","火","水","木","金","土"][dt.getDay()]})`;
}
function fmtFull(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleString("ja-JP", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function serializeEvent(ev) {
  const { fbKey, ...rest } = ev;
  return {
    ...rest,
    date:     ev.date instanceof Date ? ev.date.toISOString() : ev.date,
    deadline: ev.deadline instanceof Date ? ev.deadline.toISOString() : ev.deadline,
    attendees: ev.attendees
      ? Object.fromEntries(ev.attendees.map(a => [a.lineId, { ...a, time: a.time instanceof Date ? a.time.toISOString() : a.time }]))
      : {},
  };
}
function deserializeEvent(obj) {
  return {
    ...obj,
    date:     new Date(obj.date),
    deadline: new Date(obj.deadline),
    attendees: obj.attendees ? Object.values(obj.attendees).map(a => ({ ...a, time: new Date(a.time) })) : [],
  };
}

// ─── App ───────────────────────────────────────────────────
export default function App() {
  const [events,        setEvents]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [liffReady,     setLiffReady]     = useState(false);
  const [lineUser,      setLineUser]      = useState(null);
  const [screen,        setScreen]        = useState("calendar");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [calYear,       setCalYear]       = useState(TODAY.getFullYear());
  const [calMonth,      setCalMonth]      = useState(TODAY.getMonth());
  const [selectedDate,  setSelectedDate]  = useState(TODAY.getDate());
  const [respondForm,   setRespondForm]   = useState({ status: "参加" });
  const [editForm,      setEditForm]      = useState(null);
  const [toast,         setToast]         = useState(null);
  const [newHighlight,  setNewHighlight]  = useState(null);

  // LIFF初期化
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUser({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
        } else {
          liff.login();
        }
      } catch (e) {
        console.warn("LIFF not available (dev mode):", e.message);
        setLineUser({ userId: "mock_dev_user_001", displayName: "開発テストユーザー", pictureUrl: null });
      }
      setLiffReady(true);
    };
    initLiff();
  }, []);

  // Firebaseリアルタイム同期
  useEffect(() => {
    const unsub = onValue(ref(db, `${GROUP_PATH}/events`), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([fbKey, val]) => ({ ...deserializeEvent(val), fbKey }));
        list.sort((a,b) => new Date(a.date) - new Date(b.date));
        setEvents(list);
        setSelectedEvent(prev => prev ? list.find(e => e.fbKey === prev.fbKey) || prev : null);
      } else {
        setEvents([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const openEvent = (ev) => {
    setSelectedEvent(ev);
    const myEntry = lineUser && ev.attendees.find(a => a.lineId === lineUser.userId);
    setRespondForm({ status: myEntry ? myEntry.status : "参加" });
    setScreen("event");
  };

  // 出欠回答・編集
  const submitResponse = async () => {
    if (!lineUser || !selectedEvent) return;
    const existing = selectedEvent.attendees.find(a => a.lineId === lineUser.userId);
    const now = new Date().toISOString();
    // 参加→参加は順位維持、それ以外は現在時刻（最後尾）
    const entryTime = (existing && existing.status === "参加" && respondForm.status === "参加")
      ? (existing.time instanceof Date ? existing.time.toISOString() : existing.time)
      : now;
    const entry = {
      lineId:     lineUser.userId,
      name:       lineUser.displayName,
      pictureUrl: lineUser.pictureUrl || null,
      status:     respondForm.status,
      time:       entryTime,
      updatedAt:  now,
    };
    await set(ref(db, `${GROUP_PATH}/events/${selectedEvent.fbKey}/attendees/${lineUser.userId}`), entry);
    setNewHighlight(lineUser.userId);
    setTimeout(() => setNewHighlight(null), 4000);
    showToast(existing ? "✏️ 回答を更新しました！" : "✅ 回答しました！");
    setScreen("event");
  };

  // 回答取り消し
  const cancelResponse = async () => {
    if (!lineUser || !selectedEvent) return;
    if (!confirm("回答を取り消しますか？\n取り消し後は再度回答できます。")) return;
    await remove(ref(db, `${GROUP_PATH}/events/${selectedEvent.fbKey}/attendees/${lineUser.userId}`));
    showToast("🗑️ 回答を取り消しました");
    setScreen("event");
  };

  // イベント編集保存（管理者のみ）
  const submitEdit = async () => {
    if (!editForm.title.trim() || !isAdmin(lineUser?.userId)) return;
    await set(ref(db, `${GROUP_PATH}/events/${editForm.fbKey}`), serializeEvent(editForm));
    showToast("📝 保存しました！");
    setScreen("event");
  };

  // 新規イベント作成（管理者のみ）
  const submitNewEvent = async () => {
    if (!editForm.title.trim() || !isAdmin(lineUser?.userId)) return;
    await push(ref(db, `${GROUP_PATH}/events`), serializeEvent({ ...editForm, id: Date.now(), attendees: [] }));
    showToast("🎉 イベントを作成しました！");
    setScreen("calendar");
  };

  // イベント削除（管理者のみ）
  const deleteEvent = async (fbKey) => {
    if (!isAdmin(lineUser?.userId)) return;
    await remove(ref(db, `${GROUP_PATH}/events/${fbKey}`));
    showToast("🗑️ 削除しました");
    setScreen("calendar");
  };

  const openEdit = (ev) => {
    if (!isAdmin(lineUser?.userId)) return;
    setEditForm({ ...ev, date: new Date(ev.date), deadline: new Date(ev.deadline) });
    setScreen("edit");
  };

  const openNewEvent = (date) => {
    if (!isAdmin(lineUser?.userId)) { showToast("⛔ 管理者のみ作成できます"); return; }
    const base = date || new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    setEditForm({ id: null, title: "", date: base, time: "19:00", endTime: "21:00",
      place: "", capacity: 20, deadline: base, note: "", color: "#00B900" });
    setScreen("newEvent");
  };

  const admin = isAdmin(lineUser?.userId);

  if (loading || !liffReady) return (
    <div style={S.shell}><div style={S.phone}>
      <div style={S.loadingScreen}>
        <div style={{fontSize:40}}>🔥</div>
        <div style={{fontSize:14,color:"#888",marginTop:8}}>読み込み中...</div>
      </div>
    </div></div>
  );

  return (
    <div style={S.shell}>
      <div style={S.phone}>
        <div style={S.statusBar}/>

        {screen === "calendar" && (
          <CalendarScreen events={events} calYear={calYear} calMonth={calMonth}
            setCalYear={setCalYear} setCalMonth={setCalMonth}
            selectedDate={selectedDate} setSelectedDate={setSelectedDate}
            onOpenEvent={openEvent} onNewEvent={openNewEvent} admin={admin} />
        )}
        {screen === "event" && selectedEvent && (
          <EventScreen event={selectedEvent} lineUser={lineUser} admin={admin}
            onBack={() => setScreen("calendar")}
            onRespond={() => setScreen("respond")}
            onCancelResponse={cancelResponse}
            onEdit={() => openEdit(selectedEvent)}
            onDelete={() => deleteEvent(selectedEvent.fbKey)}
            newHighlight={newHighlight} />
        )}
        {screen === "respond" && selectedEvent && (
          <RespondScreen event={selectedEvent} lineUser={lineUser}
            form={respondForm} setForm={setRespondForm}
            onSubmit={submitResponse} onBack={() => setScreen("event")} />
        )}
        {(screen === "edit" || screen === "newEvent") && editForm && admin && (
          <EditScreen form={editForm} setForm={setEditForm} isNew={screen === "newEvent"}
            onSubmit={screen === "newEvent" ? submitNewEvent : submitEdit}
            onBack={() => setScreen(screen === "newEvent" ? "calendar" : "event")} />
        )}

        <div style={S.bottomNav}>
          <NavBtn icon="📅" label="カレンダー" active={screen==="calendar"} onClick={() => setScreen("calendar")} />
          {admin
            ? <NavBtn icon="➕" label="新規作成" active={false} onClick={() => openNewEvent(null)} isPlus />
            : <div style={{flex:1}}/>}
          <div style={S.navUserArea}>
            {lineUser?.pictureUrl
              ? <img src={lineUser.pictureUrl} style={S.navUserImg} alt="me" />
              : <div style={S.navUserInitial}>{lineUser?.displayName?.[0]}</div>}
            <span style={{fontSize:9,color:"#888",marginTop:1,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {admin ? "👑 " : ""}{lineUser?.displayName}
            </span>
          </div>
        </div>

        {toast && <div style={S.toast}>{toast}</div>}
      </div>
    </div>
  );
}

// ─── Calendar Screen ───────────────────────────────────────
function CalendarScreen({ events, calYear, calMonth, setCalYear, setCalMonth, selectedDate, setSelectedDate, onOpenEvent, onNewEvent, admin }) {
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const weeks = [];
  let day = 1 - firstDay;
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++, day++) week.push(day >= 1 && day <= daysInMonth ? day : null);
    weeks.push(week);
    if (day > daysInMonth) break;
  }
  const eventsOnDay = (d) => events.filter(e => {
    const ed = new Date(e.date);
    return ed.getFullYear()===calYear && ed.getMonth()===calMonth && ed.getDate()===d;
  });
  const isFull = (ev) => {
    const cap = ev.capacity ?? 0;
    if (cap === 0) return false;
    return ev.attendees.filter(a=>a.status==="参加").length >= cap;
  };
  const selectedEvents = selectedDate
    ? events.filter(e => { const ed=new Date(e.date); return ed.getFullYear()===calYear && ed.getMonth()===calMonth && ed.getDate()===selectedDate; })
    : [];
  const prevMonth = () => calMonth===0 ? (setCalMonth(11), setCalYear(y=>y-1)) : setCalMonth(m=>m-1);
  const nextMonth = () => calMonth===11 ? (setCalMonth(0), setCalYear(y=>y+1)) : setCalMonth(m=>m+1);

  return (
    <div style={S.screen}>
      <div style={S.calHeader}>
        <button style={S.calNavBtn} onClick={prevMonth}>‹</button>
        <span style={S.calTitle}>{calYear}年 {calMonth+1}月</span>
        <button style={S.calNavBtn} onClick={nextMonth}>›</button>
      </div>
      <div style={S.calGrid}>
        {["日","月","火","水","木","金","土"].map((d,i) => (
          <div key={d} style={{...S.calDayLabel, color:i===0?"#EF4444":i===6?"#3B82F6":"#888"}}>{d}</div>
        ))}
      </div>
      <div style={S.calBody}>
        {weeks.map((week,wi) => (
          <div key={wi} style={S.calRow}>
            {week.map((d,di) => {
              const evs        = d ? eventsOnDay(d) : [];
              const isToday    = d && calYear===TODAY.getFullYear() && calMonth===TODAY.getMonth() && d===TODAY.getDate();
              const isSelected = d && d===selectedDate;
              return (
                <div key={di} style={{...S.calCell, opacity:d?1:0.2}} onClick={() => d && setSelectedDate(d)}>
                  <div style={{...S.calNum,
                    background:isToday?"#00B900":isSelected?"#e6f9e6":"transparent",
                    color:isToday?"#fff":di===0?"#EF4444":di===6?"#3B82F6":"#333",
                    fontWeight:isToday||isSelected?700:400}}>{d||""}</div>
                  <div style={S.calDots}>
                    {evs.slice(0,3).map(ev=>(
                      <div key={ev.fbKey||ev.id} style={{...S.calDot, background: isFull(ev)?"#EF4444":ev.color}}/>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={S.calEventList}>
        {selectedDate ? (
          <>
            <div style={S.calEventListHeader}>
              <span style={S.calEventListDate}>{calMonth+1}/{selectedDate} のイベント</span>
              {admin && <button style={S.addSmallBtn} onClick={() => onNewEvent(new Date(calYear,calMonth,selectedDate))}>＋ 追加</button>}
            </div>
            {selectedEvents.length===0
              ? <div style={S.calEmpty}>イベントなし{admin && <><br/><span style={{fontSize:11,color:"#aaa"}}>「＋ 追加」で作成できます</span></>}</div>
              : selectedEvents.map(ev => <EventCard key={ev.fbKey||ev.id} ev={ev} isFull={isFull(ev)} onClick={() => onOpenEvent(ev)} />)}
          </>
        ) : (
          <div>
            <div style={S.calEventListHeader}><span style={S.calEventListDate}>今後のイベント</span></div>
            {events
              .filter(e => new Date(e.date) >= new Date(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate()))
              .map(ev => <EventCard key={ev.fbKey||ev.id} ev={ev} isFull={isFull(ev)} onClick={() => onOpenEvent(ev)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ ev, isFull, onClick }) {
  const attending = ev.attendees.filter(a=>a.status==="参加").length;
  const cap = ev.capacity ?? 0;
  return (
    <div style={{...S.eventCard, borderLeft:`4px solid ${isFull?"#EF4444":ev.color}`}} onClick={onClick}>
      <div style={S.eventCardLeft}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
          <span style={S.eventCardTitle}>{ev.title}</span>
          {isFull && <span style={S.fullBadge}>満員</span>}
        </div>
        <div style={S.eventCardMeta}>{fmt(ev.date)} {ev.time}〜 📍{ev.place}</div>
        <div style={{fontSize:10,color:"#aaa",marginTop:2}}>
          👥 {attending}{cap>0?`/${cap}名`:"名"}参加
        </div>
      </div>
    </div>
  );
}

// ─── Event Detail Screen ───────────────────────────────────
function EventScreen({ event, lineUser, admin, onBack, onRespond, onCancelResponse, onEdit, onDelete, newHighlight }) {
  const [tab, setTab] = useState("info");
  const attending = event.attendees.filter(a=>a.status==="参加");
  const absent    = event.attendees.filter(a=>a.status==="欠席");
  const undecided = event.attendees.filter(a=>a.status==="未定");
  const cap       = event.capacity ?? 0;
  const remaining = cap > 0 ? cap - attending.length : null;
  const myEntry   = lineUser && event.attendees.find(a => a.lineId === lineUser.userId);

  return (
    <div style={S.screen}>
      <div style={{...S.eventDetailHeader, background:event.color}}>
        <div style={S.eventHeaderTop}>
          <button style={S.backBtn} onClick={onBack}>‹</button>
          <div style={S.eventHeaderTitle}>{event.title}</div>
          {admin
            ? <button style={S.editIconBtn} onClick={onEdit}>✏️</button>
            : <div style={{width:32}}/>}
        </div>
        <div style={S.eventHeaderMeta}>📅 {fmt(event.date)} {event.time}〜{event.endTime}</div>
        <div style={S.eventHeaderMeta}>📍 {event.place}</div>
      </div>

      {/* 定員バー（定員0=無制限の場合は非表示） */}
      {cap > 0 && (
        <div style={S.capacityStrip}>
          <div style={S.capBar}>
            <div style={{...S.capFill, width:`${Math.min(100,(attending.length/cap)*100)}%`, background:remaining<=0?"#EF4444":event.color}}/>
          </div>
          <div style={S.capNums}>
            <span style={{color:event.color,fontWeight:700}}>{attending.length}名参加</span>
            <span style={{color:"#aaa"}}> / {cap}名定員</span>
            {remaining<=0
              ? <span style={{marginLeft:"auto",color:"#EF4444",fontWeight:700}}>満員</span>
              : <span style={{marginLeft:"auto",color:remaining<=5?"#EF4444":"#666",fontWeight:600}}>残{remaining}席</span>}
          </div>
        </div>
      )}

      <div style={S.tabs}>
        {["info","list"].map(t=>(
          <button key={t} style={{...S.tab,borderBottom:tab===t?`2px solid ${event.color}`:"2px solid transparent",color:tab===t?event.color:"#aaa"}} onClick={()=>setTab(t)}>
            {t==="info"?"📋 詳細":"👥 出欠一覧"}
          </button>
        ))}
      </div>

      <div style={S.tabContent}>
        {tab==="info" && (
          <div style={{padding:"12px 16px"}}>
            <InfoRow icon="🕐" label="時間" value={`${event.time} 〜 ${event.endTime}`} />
            <InfoRow icon="📍" label="場所" value={event.place} />
            {cap > 0 && <InfoRow icon="👥" label="定員" value={`${cap}名`} />}
            {cap === 0 && <InfoRow icon="👥" label="定員" value="制限なし" />}
            <InfoRow icon="⏰" label="締切" value={fmt(event.deadline)} />
            {event.note && <InfoRow icon="📝" label="備考" value={event.note} />}
            <div style={S.summaryCards}>
              {[["参加",attending.length,"#00B900"],["欠席",absent.length,"#EF4444"],["未定",undecided.length,"#9CA3AF"]].map(([l,c,col])=>(
                <div key={l} style={S.summaryCard}>
                  <div style={{...S.summaryCount,color:col}}>{c}</div>
                  <div style={S.summaryLabel}>{l}</div>
                </div>
              ))}
            </div>

            {/* 自分の回答カード */}
            {myEntry ? (
              <div style={S.myEntryCard}>
                <div style={{fontSize:12,color:"#555",fontWeight:600,marginBottom:8}}>あなたの回答</div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  {myEntry.pictureUrl
                    ? <img src={myEntry.pictureUrl} style={{width:36,height:36,borderRadius:"50%"}} alt="" />
                    : <div style={{...S.aAvatar,background:STATUS_META[myEntry.status].bg,width:36,height:36}}>{myEntry.name[0]}</div>}
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700}}>{myEntry.name}</div>
                    <div style={{fontSize:11,color:"#888"}}>🕐 {fmtFull(new Date(myEntry.time))}</div>
                  </div>
                  <div style={S.aPill(myEntry.status)}>{myEntry.status}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button style={{...S.respondBtn,background:event.color,flex:2,marginBottom:0}} onClick={onRespond}>✏️ 編集</button>
                  <button style={{...S.cancelResponseBtn,flex:1}} onClick={onCancelResponse}>🗑️ 取消</button>
                </div>
              </div>
            ) : (
              <button style={{...S.respondBtn,background:event.color}} onClick={onRespond}>✏️ 出欠を回答する</button>
            )}

            {/* 管理者のみ削除ボタン表示 */}
            {admin && (
              <button style={S.dangerBtn} onClick={()=>{if(confirm("このイベントを削除しますか？"))onDelete()}}>🗑️ イベントを削除</button>
            )}
          </div>
        )}
        {tab==="list" && (
          <AttendeeList attendees={event.attendees} cap={cap} newHighlight={newHighlight} color={event.color} lineUserId={lineUser?.userId} />
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={S.infoRow}>
      <span style={S.infoRowIcon}>{icon}</span>
      <span style={S.infoRowLabel}>{label}</span>
      <span style={S.infoRowValue}>{value}</span>
    </div>
  );
}

function AttendeeList({ attendees, cap, newHighlight, color, lineUserId }) {
  const sorted      = [...attendees].sort((a,b)=>new Date(a.time)-new Date(b.time));
  const participants = sorted.filter(a=>a.status==="参加");
  return (
    <div style={{padding:"8px 12px"}}>
      <div style={S.listSectionLabel}>回答一覧（先着順）</div>
      {sorted.length===0 && <div style={S.calEmpty}>まだ回答がありません</div>}
      {sorted.map((a,i) => {
        const rank   = participants.indexOf(a);
        const isOver = a.status==="参加" && cap > 0 && rank >= cap;
        const isHL   = a.lineId === newHighlight;
        const isMe   = a.lineId === lineUserId;
        return (
          <div key={a.lineId} style={{...S.attendeeRow,
            background:isHL?"#fffde7":isMe?"#f0fdf4":"#fff",
            border:isHL?`2px solid ${color}`:isMe?"1px solid #86efac":"1px solid #f0f0f0"}}>
            <div style={S.orderCircle(i,color)}>{i+1}</div>
            {a.pictureUrl
              ? <img src={a.pictureUrl} style={{width:36,height:36,borderRadius:"50%",flexShrink:0,objectFit:"cover"}} alt=""/>
              : <div style={{...S.aAvatar,background:STATUS_META[a.status].bg}}>{a.name[0]}</div>}
            <div style={S.aInfo}>
              <div style={S.aName}>
                {a.name}
                {isMe && <span style={{...S.badge,background:"#00B900"}}>自分</span>}
              </div>
              <div style={{fontSize:10,color:"#aaa",marginTop:2}}>🕐 {fmtFull(new Date(a.time))}</div>
            </div>
            <div style={S.aPill(a.status)}>{a.status==="参加"&&isOver?"補欠":a.status}</div>
            {a.status==="参加"&&!isOver&&rank<3&&(
              <div style={{fontSize:18,marginLeft:2}}>{rank===0?"🥇":rank===1?"🥈":"🥉"}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Respond Screen ────────────────────────────────────────
function RespondScreen({ event, lineUser, form, setForm, onSubmit, onBack }) {
  const myEntry   = lineUser && event.attendees.find(a => a.lineId === lineUser.userId);
  const attending = event.attendees.filter(a=>a.status==="参加").length;
  const cap       = event.capacity ?? 0;
  // 自分が参加中なら自分の席を除外して残席計算
  const myIsAttending = myEntry?.status === "参加";
  const remaining = cap > 0 ? cap - attending + (myIsAttending ? 1 : 0) : null;
  const isFull    = remaining !== null && remaining <= 0;

  return (
    <div style={S.screen}>
      <div style={{...S.eventDetailHeader,background:event.color,paddingBottom:14}}>
        <div style={S.eventHeaderTop}>
          <button style={S.backBtn} onClick={onBack}>‹</button>
          <div style={S.eventHeaderTitle}>{myEntry ? "回答を編集" : "出欠を回答する"}</div>
          <div style={{width:32}}/>
        </div>
        <div style={S.eventHeaderMeta}>{event.title}</div>
      </div>
      <div style={{padding:"16px"}}>
        {/* LINEプロフィール */}
        <div style={S.profileCard}>
          {lineUser?.pictureUrl
            ? <img src={lineUser.pictureUrl} style={{width:48,height:48,borderRadius:"50%"}} alt=""/>
            : <div style={{...S.aAvatar,width:48,height:48,background:"#00B900",fontSize:18}}>{lineUser?.displayName?.[0]}</div>}
          <div>
            <div style={{fontWeight:700,fontSize:15}}>{lineUser?.displayName}</div>
            <div style={{fontSize:11,color:"#888"}}>このアカウントで回答します</div>
          </div>
        </div>

        <label style={S.formLabel}>出欠を選択してください</label>
        <div style={S.statusBtns}>
          {["参加","欠席","未定"].map(s=>(
            <button key={s} style={{...S.statusBtn,
              background:form.status===s?STATUS_META[s].bg:"#f3f4f6",
              color:form.status===s?"#fff":"#555",
              border:`2px solid ${form.status===s?STATUS_META[s].bg:"#e5e7eb"}`}}
              onClick={()=>setForm({...form,status:s})}>
              {STATUS_META[s].icon} {s}
            </button>
          ))}
        </div>

        {form.status==="参加" && remaining!==null && remaining<=5 && remaining>0 && (
          <div style={S.warnBox}>⚠️ 残席わずか！（残{remaining}席）</div>
        )}
        {form.status==="参加" && isFull && (
          <div style={{...S.warnBox,background:"#fee2e2",borderColor:"#EF4444"}}>😢 定員に達しています。補欠登録になります。</div>
        )}
        {myEntry && myEntry.status==="欠席" && form.status==="参加" && (
          <div style={{...S.warnBox,background:"#eff6ff",borderColor:"#3B82F6"}}>ℹ️ 欠席→参加の変更は先着順の最後尾になります。</div>
        )}

        <button style={{...S.respondBtn,background:event.color,marginTop:20}} onClick={onSubmit}>
          {myEntry ? "更新する" : "送信する"}
        </button>
      </div>
    </div>
  );
}

// ─── Edit / New Event Screen ───────────────────────────────
function EditScreen({ form, setForm, isNew, onSubmit, onBack }) {
  const dateStr     = form.date     ? toLocalDateStr(form.date instanceof Date ? form.date : new Date(form.date)) : "";
  const deadlineStr = form.deadline ? toLocalDateStr(form.deadline instanceof Date ? form.deadline : new Date(form.deadline)) : "";
  return (
    <div style={S.screen}>
      <div style={{...S.eventDetailHeader,background:form.color||"#00B900",paddingBottom:14}}>
        <div style={S.eventHeaderTop}>
          <button style={S.backBtn} onClick={onBack}>‹</button>
          <div style={S.eventHeaderTitle}>{isNew?"イベントを作成":"イベントを編集"}</div>
          <div style={{width:32}}/>
        </div>
      </div>
      <div style={{overflowY:"auto",flex:1,padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
        <Field label="タイトル" required>
          <input style={S.formInput} placeholder="例：🎉 歓迎会" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
        </Field>
        <Field label="開催日">
          <input type="date" style={S.formInput} value={dateStr} onChange={e=>setForm({...form,date:new Date(e.target.value+"T00:00:00")})} />
        </Field>
        <div style={{display:"flex",gap:8}}>
          <Field label="開始時刻" style={{flex:1}}>
            <input type="time" style={S.formInput} value={form.time} onChange={e=>setForm({...form,time:e.target.value})} />
          </Field>
          <Field label="終了時刻" style={{flex:1}}>
            <input type="time" style={S.formInput} value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})} />
          </Field>
        </div>
        <Field label="場所">
          <input style={S.formInput} placeholder="例：渋谷 居酒屋「葵」" value={form.place} onChange={e=>setForm({...form,place:e.target.value})} />
        </Field>
        <Field label="定員（0=制限なし）">
          <input type="number" style={S.formInput} value={form.capacity} min={0}
            onChange={e=>setForm({...form,capacity:Math.max(0,parseInt(e.target.value)||0)})} />
          <div style={{fontSize:11,color:"#888",marginTop:4}}>※ 0に設定すると定員制限なしになります</div>
        </Field>
        <Field label="回答締切">
          <input type="date" style={S.formInput} value={deadlineStr} onChange={e=>setForm({...form,deadline:new Date(e.target.value+"T00:00:00")})} />
        </Field>
        <Field label="備考">
          <textarea style={{...S.formInput,height:72,resize:"none"}} placeholder="例：参加費3,000円など" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} />
        </Field>
        <Field label="カラー">
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {EVENT_COLORS.map(c=>(
              <button key={c} style={{...S.colorDot,background:c,outline:form.color===c?`3px solid ${c}`:"none",outlineOffset:2}} onClick={()=>setForm({...form,color:c})}/>
            ))}
          </div>
        </Field>
        <button style={{...S.respondBtn,background:form.title.trim()?(form.color||"#00B900"):"#ccc",marginTop:8}} onClick={onSubmit} disabled={!form.title.trim()}>
          {isNew?"作成する":"保存する"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, required, style }) {
  return (
    <div style={style}>
      <label style={S.formLabel}>{label}{required&&<span style={{color:"#EF4444"}}> *</span>}</label>
      {children}
    </div>
  );
}

function NavBtn({ icon, label, active, onClick, isPlus }) {
  return (
    <button style={{...S.navBtn,color:active?"#00B900":"#aaa"}} onClick={onClick}>
      {isPlus ? <div style={S.plusCircle}>{icon}</div> : <span style={{fontSize:20}}>{icon}</span>}
      <span style={{fontSize:10,marginTop:2}}>{label}</span>
    </button>
  );
}

// ─── Styles ────────────────────────────────────────────────
const S = {
  shell:{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a,#1e3a5f)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"24px 16px", fontFamily:"'Hiragino Sans','Noto Sans JP',sans-serif" },
  phone:{ width:390, background:"#f3f4f6", borderRadius:40, overflow:"hidden", display:"flex", flexDirection:"column", maxHeight:820, position:"relative", boxShadow:"0 30px 80px rgba(0,0,0,0.5)" },
  statusBar:{ background:"#00B900", height:16 },
  screen:{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", background:"#f3f4f6" },
  loadingScreen:{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 },
  calHeader:{ background:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"1px solid #e5e7eb" },
  calNavBtn:{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#00B900", padding:"0 8px" },
  calTitle:{ fontWeight:800, fontSize:17, color:"#111" },
  calGrid:{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:"#fff", padding:"6px 8px 0" },
  calDayLabel:{ textAlign:"center", fontSize:11, fontWeight:600, paddingBottom:4 },
  calBody:{ background:"#fff", padding:"0 8px 8px", borderBottom:"1px solid #e5e7eb" },
  calRow:{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" },
  calCell:{ display:"flex", flexDirection:"column", alignItems:"center", padding:"3px 0", cursor:"pointer" },
  calNum:{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, lineHeight:1 },
  calDots:{ display:"flex", gap:2, height:6, alignItems:"center", marginTop:1 },
  calDot:{ width:5, height:5, borderRadius:"50%" },
  calEventList:{ flex:1, overflowY:"auto", padding:"10px 12px" },
  calEventListHeader:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 },
  calEventListDate:{ fontWeight:700, fontSize:13, color:"#333" },
  addSmallBtn:{ background:"#00B900", color:"#fff", border:"none", borderRadius:16, padding:"4px 12px", fontSize:12, fontWeight:700, cursor:"pointer" },
  calEmpty:{ textAlign:"center", color:"#bbb", fontSize:13, padding:"24px 0", lineHeight:2 },
  fullBadge:{ background:"#EF4444", color:"#fff", borderRadius:8, padding:"1px 7px", fontSize:10, fontWeight:700 },
  eventCard:{ background:"#fff", borderRadius:12, padding:"10px 14px", marginBottom:8, display:"flex", alignItems:"center", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", cursor:"pointer" },
  eventCardLeft:{ flex:1 },
  eventCardTitle:{ fontWeight:700, fontSize:14, color:"#111" },
  eventCardMeta:{ fontSize:11, color:"#888" },
  eventDetailHeader:{ padding:"10px 16px 16px", color:"#fff" },
  eventHeaderTop:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  backBtn:{ background:"none", border:"none", color:"#fff", fontSize:28, cursor:"pointer", padding:0, lineHeight:1 },
  eventHeaderTitle:{ fontWeight:800, fontSize:16, flex:1, textAlign:"center" },
  editIconBtn:{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, padding:"4px 8px", fontSize:16, cursor:"pointer" },
  eventHeaderMeta:{ fontSize:12, opacity:0.9, marginTop:3 },
  capacityStrip:{ background:"#fff", padding:"10px 16px", borderBottom:"1px solid #e5e7eb" },
  capBar:{ height:8, background:"#e5e7eb", borderRadius:4, overflow:"hidden", marginBottom:5 },
  capFill:{ height:"100%", borderRadius:4, transition:"width 0.6s ease" },
  capNums:{ display:"flex", fontSize:12, color:"#666", alignItems:"center" },
  tabs:{ display:"flex", background:"#fff", borderBottom:"1px solid #e5e7eb" },
  tab:{ flex:1, padding:"10px 0", background:"none", border:"none", borderBottom:"2px solid transparent", fontSize:13, fontWeight:600, cursor:"pointer" },
  tabContent:{ flex:1, overflowY:"auto" },
  infoRow:{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 0", borderBottom:"1px solid #f3f4f6" },
  infoRowIcon:{ fontSize:16, width:20, textAlign:"center" },
  infoRowLabel:{ fontSize:12, color:"#888", width:52 },
  infoRowValue:{ fontSize:13, color:"#333", flex:1, lineHeight:1.5 },
  summaryCards:{ display:"flex", gap:8, margin:"14px 0" },
  summaryCard:{ flex:1, background:"#f9fafb", borderRadius:12, padding:"10px 0", textAlign:"center" },
  summaryCount:{ fontSize:22, fontWeight:800 },
  summaryLabel:{ fontSize:11, color:"#888", marginTop:2 },
  myEntryCard:{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:14, padding:"12px", marginBottom:10 },
  profileCard:{ display:"flex", alignItems:"center", gap:12, background:"#f9fafb", borderRadius:14, padding:"12px 14px", marginBottom:16 },
  respondBtn:{ width:"100%", padding:"13px", color:"#fff", border:"none", borderRadius:25, fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 12px rgba(0,0,0,0.15)", marginBottom:8 },
  cancelResponseBtn:{ padding:"13px", color:"#EF4444", background:"#fff", border:"1.5px solid #fca5a5", borderRadius:25, fontSize:14, fontWeight:700, cursor:"pointer" },
  dangerBtn:{ width:"100%", padding:"10px", color:"#EF4444", background:"none", border:"1px solid #fca5a5", borderRadius:25, fontSize:13, cursor:"pointer", marginTop:4 },
  listSectionLabel:{ fontSize:12, fontWeight:700, color:"#888", marginBottom:8 },
  attendeeRow:{ borderRadius:12, padding:"10px", marginBottom:6, display:"flex", alignItems:"center", gap:8, boxShadow:"0 1px 3px rgba(0,0,0,0.04)", transition:"all 0.3s" },
  orderCircle:(i,color)=>({ width:22, height:22, borderRadius:"50%", flexShrink:0, background:i<3?["#FFD700","#C0C0C0","#CD7F32"][i]:color+"22", color:i<3?"#fff":color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700 }),
  aAvatar:{ width:36, height:36, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:13 },
  aInfo:{ flex:1, minWidth:0 },
  aName:{ fontSize:13, fontWeight:600, color:"#111", display:"flex", alignItems:"center", gap:4 },
  badge:{ color:"#fff", borderRadius:6, padding:"1px 5px", fontSize:9, fontWeight:700 },
  aPill:(status)=>({ background:STATUS_META[status].light, color:STATUS_META[status].bg, borderRadius:10, padding:"3px 8px", fontSize:11, fontWeight:700, flexShrink:0 }),
  formLabel:{ display:"block", fontSize:12, fontWeight:600, color:"#555", marginBottom:5 },
  formInput:{ width:"100%", padding:"10px 12px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box", background:"#fff" },
  statusBtns:{ display:"flex", gap:8, marginBottom:8 },
  statusBtn:{ flex:1, padding:"12px 0", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer" },
  warnBox:{ background:"#fefce8", border:"1px solid #FCD34D", borderRadius:10, padding:"10px 12px", fontSize:12, color:"#666", marginBottom:8, lineHeight:1.5 },
  colorDot:{ width:28, height:28, borderRadius:"50%", border:"none", cursor:"pointer" },
  bottomNav:{ background:"#fff", borderTop:"1px solid #e5e7eb", display:"flex", alignItems:"center", padding:"6px 0 4px" },
  navBtn:{ flex:1, background:"none", border:"none", display:"flex", flexDirection:"column", alignItems:"center", cursor:"pointer", padding:"2px 0" },
  navUserArea:{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 },
  navUserImg:{ width:28, height:28, borderRadius:"50%", objectFit:"cover" },
  navUserInitial:{ width:28, height:28, borderRadius:"50%", background:"#00B900", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700 },
  plusCircle:{ width:38, height:38, borderRadius:"50%", background:"#00B900", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, boxShadow:"0 2px 8px rgba(0,185,0,0.35)" },
  toast:{ position:"absolute", bottom:80, left:"50%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.75)", color:"#fff", borderRadius:20, padding:"8px 20px", fontSize:13, whiteSpace:"nowrap", zIndex:100 },
};
