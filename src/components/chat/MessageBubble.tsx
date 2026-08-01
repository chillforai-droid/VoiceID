import { memo } from 'react';
import { VoiceMessage } from './VoiceMessage';
import { ImageMessage } from './ImageMessage';

interface MessageBubbleProps {
  message: any;
  isOwn: boolean;
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
  onRetry?: () => void;
}

// Same markup/behavior as the previous inline JSX in ChatPage — extracted
// only so React.memo can skip re-rendering every other bubble in the list
// when a single message is selected, edited, or highlighted.
function MessageBubbleImpl({
  message: m,
  isOwn,
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
  onRetry,
}: MessageBubbleProps) {
  return (
    <div
      id={`msg-${m.id}`}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} group transition-colors rounded-2xl ${isHighlighted ? 'ring-2 ring-blue-400 bg-blue-50/60' : ''}`}
      onClick={onToggleSelect}
    >
      <div className={`p-3 px-4 rounded-2xl max-w-[88%] sm:max-w-[75%] md:max-w-[65%] break-words ${isOwn ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-900 rounded-tl-sm border border-gray-100'}`}>
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
            {m.content_type === 'voice' ? <VoiceMessage message={m} /> : (m.content_type === 'image' ? <ImageMessage message={m} /> : <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content_body}</span>)}
            <p className={`text-[10px] mt-1 flex items-center gap-1.5 ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {isOwn && m._status === 'sending' && <span className="italic">Sending…</span>}
              {isOwn && m._status === 'failed' && (
                <button
                  onClick={e => { e.stopPropagation(); onRetry?.(); }}
                  className="underline decoration-dotted text-red-200 hover:text-white font-medium"
                >
                  Failed — tap to retry
                </button>
              )}
            </p>
          </>
        )}
      </div>
      {isOwn && !isEditing && isSelected && !m._status && (
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
