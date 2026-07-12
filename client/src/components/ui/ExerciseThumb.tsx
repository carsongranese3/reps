import { useState } from 'react';
import { PlayIcon } from '../icons';
import { categoryColor } from '../../lib/category';
import { exercisePhoto } from '../../lib/youtube';

interface ExerciseThumbLike {
  image?: string | null;
  video_url?: string | null;
  category: string | null;
}

/**
 * The exercise's photo for cards/rows: an uploaded image, else the YouTube
 * thumbnail derived from its video_url, else a category-colored block with a
 * play glyph. If the image fails to load, it falls back to the color block.
 */
export function ExerciseThumb({
  exercise,
  className = '',
  iconSize = 18,
}: {
  exercise: ExerciseThumbLike;
  className?: string;
  iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const photo = exercisePhoto(exercise);

  if (photo && !failed) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={photo}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ backgroundColor: categoryColor(exercise.category) }}
    >
      <PlayIcon size={iconSize} />
    </div>
  );
}
