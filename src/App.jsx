import { useState } from "react";
const CARS = [
  { id: 1, name: "社用車 A", plate: "品川 300 あ 1234", color: "#E74C3C", icon: "🚗" },
  { id: 2, name: "社用車 B", plate: "品川 300 い 5678", color: "#2980B9", icon: "🚙" },
  { id: 3, name: "社用車 C", plate: "品川 300 う 9012", color: "#27AE60", icon: "🚘" },
];
const USERS = ["田中 太郎","鈴木 花子","佐藤 健","高橋 美咲","伊藤 浩","渡辺 由美","山本 翔","中村 彩","小林 大輔","加藤 未来"];
const TIME_SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00"];
const today = () => new Date().toISOString().split("T")[0];
const formatDate = (d) => { const dt = new Date(d+"T00:00:00"); const days=["日","月","火","水","木","金","土"]; return `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})`; };
const getWeekDates = (base) => { const d=new Date(base+"T00:00:00"); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1)); return Array.from({length:7},(_,i)=>{ const dd=new Date(mon); dd.setDate(mon.getDate()+i); return dd.toISOString().split("T")[0]; }); };
const navBtn={background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:16,color:"#4A5568"};
const cardStyle={background:"#fff",borderRadius:14,padding:"14px",marginBottom:10,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"};
const labelStyle={display:"block",fontSize:12,color:"#718096",marginBottom:5,fontWeight:600};
const inputStyle={width:"100%",padding:"10px 12px",borderRadius:9,border:"1px solid #E2E8F0",fontSize:14,background:"#F7FAFC",outline:"none",color:"#2D3748"};
const overlay={position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:150};
const modal={background:"#fff",borderRadius:"20px 20px 0 0",padding:20,width:"100%",maxWidth:480,maxHeight:"80vh",overflowY:"auto"};
export default function App() {
  const [view,setView]=useState("calendar");
  const [currentUser,setCurrentUser]=useState(USERS[0]);
  const [reservations,setReservations]=useState([]);
  const [selectedDate,setSelectedDate]=useState(today());
  const [weekOffset,setWeekOffset]=useState(0);
  const [form,setForm]=useState({carId:1,date:today(),startTime:"09:00",endTime:"10:00",destination:"",purpose:""});
  const [toast,setToast]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [loginOpen,setLoginOpen]=useState(false);
  const weekBase=(()=>{ const d=new Date(today()+"T00:00:00"); d.setDate(d.getDate()+weekOffset*7); return d.toISOString().split("T")[0]; })();
  const weekDates=getWeekDates(weekBase);
  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); };
  const isConflict=(carId,date,start,end,excludeId=null)=>reservations.some(r=>r.id!==excludeId&&r.carId===carId&&r.date===date&&r.startTime<end&&r.endTime>start);
  const handleReserve=()=>{ if(!form.destination.trim()){showToast("行先を入力してください","error");return;} if(form.startTime>=form.endTime){showToast("終了時刻は開始より後にしてください","error");return;} if(form.date<today()){showToast("過去の日付には予約できません","error");return;} if(isConflict(form.carId,form.date,form.startTime,form.endTime)){showToast("その時間帯はすでに予約されています","error");return;} setReservations(prev=>[...prev,{id:Date.now(),...form,user:currentUser,createdAt:new Date().toISOString()}]); showToast("予約が完了しました！"); setView("myBookings"); };
  const handleDelete=(id)=>{ setReservations(prev=>prev.filter(r=>r.id!==id)); setConfirmDelete(null); showToast("予約を取り消しました","info"); };
  const myReservations=reservations.filter(r=>r.user===currentUser).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  const getCarStatus=(carId,date)=>{ const now=new Date(); const nowStr=`${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`; const t=today(); return reservations.find(r=>r.carId===carId&&r.date===date&&(date>t||(date===t&&r.startTime<=nowStr&&r.endTime>nowStr))); };
  return (
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"linear-gradient(135deg,#1A2980 0%,#26D0CE 100%)",padding:"16px 18px 12px",color:"#fff",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(0,0,0,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:18,fontWeight:700}}>🚗 社用車予約</div><div style={{fontSize:11,opacity:0.85}}>3台 ／ 営業部10名</div></div>
          <button onClick={()=>setLoginOpen(true)} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.4)",borderRadius:20,padding:"5px 12px",color:"#fff",fontSize:12,cursor:"pointer"}}>👤 {currentUser.split(" ")[0]}</button>
        </div>
      </div>
      <div style={{display:"flex",background:"#fff",borderBottom:"1px solid #E2E8F0",position:"sticky",top:68,zIndex:99}}>
        {[{key:"calendar",label:"📅 カレンダー"},{key:"reserve",label:"＋ 予約"},{key:"myBookings",label:"📋 マイ予約"},{key:"admin",label:"⚙ 管理"}].map(tab=>(
          <button key={tab.key} onClick={()=>setView(tab.key)} style={{flex:1,padding:"10px 0",fontSize:11,fontWeight:view===tab.key?700:400,color:view===tab.key?"#1A2980":"#718096",background:"none",border:"none",cursor:"pointer",borderBottom:view===tab.key?"2px solid #1A2980":"2px solid transparent"}}>{tab.label}</button>
        ))}
      </div
