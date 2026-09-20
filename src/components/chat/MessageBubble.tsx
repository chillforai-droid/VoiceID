import { memo } from 'react';
import { VoiceMessage } from './VoiceMessage';
import { ImageMessage } from './ImageMessage';
import { LinkifiedText } from './LinkifiedText';
import { Clock3, Check, CheckCheck, AlertCircle, MessageCircleHeart } from 'lucide-react';

interface MessageBubbleProps {
  message: any;
  isOwn: boolean;
  receiptStatus?: 'sent' | 'delivered' | 'read';
  isHighlighted: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleSelect: () => void;
  onStartEdit: () => void;
  onRequestDelete: () => void;
}

// Same markup/behavior as the previous inline JSX in ChatPage — extracted
// only so React.memo can skip re-rendering every other bubble in the list
// when a single message is selected, edited, or highlighted.
function MessageBubbleImpl({
  message: m,
  isOwn,
  receiptStatus = 'sent',
  isHighlighted,
  isSelected,
  isEditing,
  editContent,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  onToggleSelect,
  onStartEdit,
  onRequestDelete,
}: MessageBubbleProps) {
  return (
    <div
      id={`msg-${m.id}`}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} group transition-colors rounded-2xl animate-message-in ${isHighlighted ? 'ring-2 ring-blue-400 bg-blue-50/60' : ''}`}
      onClick={onToggleSelect}
    >
      <div className={`px-4 py-3 max-w-[92%] sm:max-w-[78%] md:max-w-[68%] break-words rounded-[22px] shadow-sm ${isOwn ? 'bg-gradient-to-br from-blue-600 to-violet-600 text-white rounded-br-md shadow-blue-200/40' : 'bg-white/95 text-slate-900 rounded-bl-md ring-1 ring-slate-200/80 shadow-slate-200/50'}`}>
        {isEditing ? (
          <div className='flex flex-wrap gap-2 items-center' onClick={e => e.stopPropagation()}>
            <input
              value={editContent}
              onChange={e => onEditContentChange(e.target.value)}
              autoFocus
              className='text-black p-2 rounded-lg min-w-0 flex-1 outline-none focus:ring-2 focus:ring-white/50'
              aria-label="Edit message"
            />
            <div className="flex gap-2 shrink-0">
              <button onClick={e => { e.stopPropagation(); onSaveEdit(); }} className='text-xs bg-white text-blue-600 px-3 py-1.5 rounded-full font-medium'>Save</button>
              <button onClick={e => { e.stopPropagation(); onCancelEdit(); }} className='text-xs text-blue-100 px-2 py-1.5'>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {m.content_type === 'voice' ? <VoiceMessage message={m} /> : m.content_type === 'image' ? <ImageMessage message={m} /> : (typeof m.content_body === 'string' && m.content_body.toLowerCase().startsWith('replied to your story') ? (
              <div className={`flex min-w-[190px] items-center gap-3 rounded-2xl border p-2.5 ${isOwn ? 'border-white/20 bg-white/10' : 'border-violet-100 bg-gradient-to-br from-violet-50 to-sky-50'}`}>
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-400 via-fuchsia-400 to-sky-400 text-white shadow-sm">
                  <MessageCircleHeart size={25} />
                </div>
                <div className="min-w-0">
                  <div className={`text-[11px] font-bold ${isOwn ? 'text-white/75' : 'text-violet-600'}`}>Replied to your story</div>
                  <div className="mt-0.5 whitespace-pre-wrap text-[15px] font-semibold [overflow-wrap:anywhere]"><LinkifiedText text={m.content_body.replace(/^replied to your story[:\s]*/i, '') || 'Story'}/></div>
                </div>
              </div>
            ) : <span className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-6"><LinkifiedText text={m.content_body} /></span>)}
            <p className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${isOwn ? 'text-white/70' : 'text-slate-400'}`}>
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {isOwn && m.local_failed && <span className="ml-1 inline-flex items-center gap-0.5 text-red-300"><AlertCircle size={10} /> {m.local_failed_reason || 'failed to send'}</span>}
              {isOwn && m.local_pending && !m.local_failed && <span className="ml-1 inline-flex items-center gap-0.5"><Clock3 size={10} /> sending</span>}
              {isOwn && !m.local_pending && !m.local_failed && (
                <span className={`inline-flex items-center ${receiptStatus === 'read' ? 'text-white' : 'text-blue-100'}`}>
                  {receiptStatus === 'sent' ? <Check size={11} /> : <CheckCheck size={13} />}
                </span>
              )}
            </p>
          </>
        )}
      </div>
      {isOwn && !isEditing && isSelected && (
        <div className="flex items-center gap-4 mt-1 px-1" onClick={e => e.stopPropagation()}>
          {m.content_type === 'text' && (
            <button onClick={e => { e.stopPropagation(); onStartEdit(); }} className="text-xs text-blue-600 font-medium hover:text-blue-800 py-1">Edit</button>
          )}
          <button onClick={e => { e.stopPropagation(); onRequestDelete(); }} className="text-xs text-red-600 font-medium hover:text-red-800 py-1">Delete</button>
        </div>
      )}
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
