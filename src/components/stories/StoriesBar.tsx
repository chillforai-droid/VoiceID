import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStories } from '../../hooks/useStories';
import { StoryComposer } from './StoryComposer';
import { StoryViewer } from './StoryViewer';

export function StoriesBar() {
  const { user, profile } = useAuth();
  const { groups, loading, refresh, markViewed, isViewed, getViewers, deleteStory } = useStories();
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerGroupIndex, setViewerGroupIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (loading && groups.length === 0) return null;

  const myGroup = user ? groups.find(g => g.user.id === user.id) : undefined;
  const otherGroups = groups.filter(g => g.user.id !== user?.id);

  return (
    <div className="mb-2">
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 px-1">
        {/* Your story / add story */}
        <button
          onClick={() => (myGroup ? setViewerGroupIndex(groups.indexOf(myGroup)) : setComposerOpen(true))}
          className="flex flex-col items-center gap-1 shrink-0 w-16"
        >
          <div className={`relative w-16 h-16 rounded-full p-[2px] ${myGroup && !myGroup.allViewed ? 'bg-gradient-to-tr from-blue-500 to-cyan-400' : myGroup ? 'bg-gray-200' : ''}`}>
            <div className="w-full h-full rounded-full bg-white p-[2px]">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="You" decoding="async" className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  {(profile?.display_name || 'Y').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setComposerOpen(true); }}
              aria-label="Add story"
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center ring-2 ring-white"
            >
              <Plus size={14} />
            </button>
          </div>
          <span className="text-xs text-gray-600 truncate w-full text-center">Your Story</span>
        </button>

        {otherGroups.map((g) => (
          <button
            key={g.user.id}
            onClick={() => setViewerGroupIndex(groups.indexOf(g))}
            className="flex flex-col items-center gap-1 shrink-0 w-16"
          >
            <div className={`w-16 h-16 rounded-full p-[2px] ${g.allViewed ? 'bg-gray-200' : 'bg-gradient-to-tr from-blue-500 to-cyan-400'}`}>
              <div className="w-full h-full rounded-full bg-white p-[2px]">
                {g.user.avatar_url ? (
                  <img src={g.user.avatar_url} alt={g.user.display_name || g.user.username} decoding="async" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    {(g.user.display_name || g.user.username).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <span className="text-xs text-gray-600 truncate w-full text-center">{g.user.display_name || g.user.username}</span>
          </button>
        ))}
      </div>

      {composerOpen && (
        <StoryComposer
          onClose={() => setComposerOpen(false)}
          onPosted={() => { setComposerOpen(false); refresh(); }}
        />
      )}

      {viewerGroupIndex !== null && groups[viewerGroupIndex] && (
        <StoryViewer
          groups={groups}
          startIndex={viewerGroupIndex}
          onClose={() => { setViewerGroupIndex(null); refresh(); }}
          markViewed={markViewed}
          isViewed={isViewed}
          getViewers={getViewers}
          deleteStory={deleteStory}
        />
      )}
    </div>
  );
}
