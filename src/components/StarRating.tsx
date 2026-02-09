import React from 'react';
import { Star } from 'lucide-react';

/**
 * StarRating component - displays and allows setting 0-5 star ratings
 */
interface StarRatingProps {
  rating?: number;
  onRatingChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StarRating({ rating = 0, onRatingChange, readOnly = false, size = 'md' }: StarRatingProps) {
  const [hoveredStar, setHoveredStar] = React.useState(0);
  
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };
  
  const iconSize = sizeClasses[size];
  
  const handleClick = (star: number) => {
    if (!readOnly && onRatingChange) {
      // Toggle: if clicking the same star, set to 0, otherwise set to clicked value
      onRatingChange(rating === star ? 0 : star);
    }
  };
  
  const handleMouseEnter = (star: number) => {
    if (!readOnly) {
      setHoveredStar(star);
    }
  };
  
  const handleMouseLeave = () => {
    if (!readOnly) {
      setHoveredStar(0);
    }
  };
  
  const displayRating = hoveredStar || rating;
  
  return (
    <div 
      className="flex gap-0.5 items-center"
      onMouseLeave={handleMouseLeave}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick(star);
          }}
          onMouseEnter={() => handleMouseEnter(star)}
          disabled={readOnly}
          className={`transition-colors ${
            readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          }`}
          title={`${star} star${star > 1 ? 's' : ''}`}
        >
          <Star
            className={`${iconSize} ${
              star <= displayRating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-slate-600'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
