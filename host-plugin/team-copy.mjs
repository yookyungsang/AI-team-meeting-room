// Static menu copy only. Existing journals keep their saved language and routes.
import {translate} from './i18n.mjs';
const roleNames={director:'총괄 디렉터',planner:'기획자',designer:'디자이너',programmer1:'프로그래머 1',programmer2:'프로그래머 2',qa:'QA 담당자'};
const copy={
 ja:{
  lead:'プロジェクト {project} の基本チームを設定してください。',
  reuse:'最初に開いた既存チャットを総括として使い、名前を「プロジェクト名 · 総括ディレクター」に変更してください。履歴と現在のモデル・推論設定は維持してください。企画担当、デザイナー、プログラマー2名、QAの5つの新規チャットだけを作成し、役割を設定して同じ会議室に接続してください。接続後もこの元のチャットで作業を続けます。総括の指針はこの設定ターンで適用し、別の初期化メッセージは送らないでください。',
  legacy:'元の計画に従い、総括、企画担当、デザイナー、プログラマー2名、QAの6つの新規チャットを設定してください。',
  settings:'新規チャットには次のモデル・推論設定をそのまま使用してください：',
  current:'元のチャットを使用。現在のモデル・推論設定を維持',
  guards:'この元の計画を引き継いでください。準備済みのチャット、モデル選択、予約は維持してください。各claimが返したnativeToolをそのまま使用してください。set_thread_titleは元の総括の名前変更であり、代わりのチャットを作成しません。許可された再試行の前に、実際のnative結果と進行中の作業を確認してください。不明な試行では実際の結果と直接のユーザー承認を確認してください。未対応のモデル・推論設定は置き換えず、問題を報告してください。この依頼はチーム設定のみです。実装は開始しないでください。',
  resume:'中断・エラー後の再開依頼です。設定がまだ進行中なら重複実行しないでください。元の各試行の実際の結果を先に確認し、準備済みの担当者は維持してください。作成の成否が不明な場合は新しく作らず、元の試行を確認してください。実際に未作成と確認できた失敗だけ、この直接の再開依頼の範囲内で元のretry手順に従ってください。'
 },
 'zh-Hans':{
  lead:'请为项目 {project} 设置基本团队。',
  reuse:'将最初打开的现有聊天用作总负责人，重命名为“项目名 · 总负责人”，保留记录和当前模型、推理设置。只为策划、设计师、2 名程序员和 QA 创建 5 个新聊天，设置角色并连接到同一会议室。连接后继续在此原始聊天中工作。在本次设置中应用总负责人规则，不要另外发送初始化消息。',
  legacy:'继续原计划，为总负责人、策划、设计师、2 名程序员和 QA 设置 6 个新聊天。',
  settings:'请为新聊天原样使用以下模型和推理设置：',
  current:'使用原始聊天，保留当前模型和推理设置',
  guards:'继续此原始计划，保留已准备好的聊天、模型选择和预留项。原样使用每次 claim 返回的 nativeTool。set_thread_title 仅重命名原来的总负责人，不得创建替代聊天。获得授权后重试前，先核对实际 native 结果和仍在进行的任务。对于不确定的尝试，先确认实际结果和用户的直接授权。不支持的模型或推理组合不得替换，请报告问题。本请求仅用于团队设置，不要开始实现任务。',
  resume:'这是中断或出错后的继续请求。如果设置仍在进行，不要重复执行。先核对原来每次尝试的实际结果，保留已准备好的成员。创建结果不确定时不要另建聊天，先核对原始尝试。只有确认实际未创建的失败，才可在本次直接继续请求的范围内按原 retry 流程处理。'
 },
 'zh-Hant':{
  lead:'請為專案 {project} 設定基本團隊。',
  reuse:'將最初開啟的現有聊天用作總負責人，重新命名為「專案名 · 總負責人」，保留記錄與目前模型、推理設定。只為企劃、設計師、2 名程式設計師與 QA 建立 5 個新聊天，設定角色並連接至同一會議室。連接後繼續在此原始聊天中工作。在本次設定中套用總負責人規則，不要另外傳送初始化訊息。',
  legacy:'繼續原計畫，為總負責人、企劃、設計師、2 名程式設計師與 QA 設定 6 個新聊天。',
  settings:'請為新聊天原樣使用以下模型與推理設定：',
  current:'使用原始聊天，保留目前模型與推理設定',
  guards:'繼續此原始計畫，保留已準備好的聊天、模型選擇與預留項目。原樣使用每次 claim 傳回的 nativeTool。set_thread_title 僅重新命名原來的總負責人，不得建立替代聊天。獲得授權後重試前，先核對實際 native 結果與仍在進行的任務。對於不確定的嘗試，先確認實際結果與使用者的直接授權。不支援的模型或推理組合不得替換，請回報問題。本請求僅用於團隊設定，不要開始實作任務。',
  resume:'這是中斷或出錯後的繼續請求。如果設定仍在進行，不要重複執行。先核對原來每次嘗試的實際結果，保留已準備好的成員。建立結果不確定時不要另建聊天，先核對原始嘗試。只有確認實際未建立的失敗，才可在本次直接繼續請求的範圍內依原 retry 流程處理。'
 }
};
export function localizedRequest(row,choices){
 const text=copy[row.language],t=value=>translate(row.language,value);
 const settings=choices.map(c=>t(roleNames[c.slotId])+': '+(c.slotId==='director'&&row.directorMode==='opening-chat'?text.current:c.model==='default'?t('Codex 기본 설정'):c.model+' / '+c.thinking));
 return text.lead.replace('{project}',()=>JSON.stringify(row.context.name))+' '+(row.directorMode==='opening-chat'?text.reuse:text.legacy)+'\n'+text.settings+'\n'+settings.join('\n')+`\n\n[TEAM-ROOM-SETUP ${row.projectId} ${row.setupId}]\n`+text.guards;
}
export const continuationCopy=language=>copy[language]?.resume;
