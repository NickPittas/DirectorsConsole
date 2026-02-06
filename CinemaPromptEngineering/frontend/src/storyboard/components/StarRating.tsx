import { useState } from 'react';
import { Star } from 'lucide-react';
import './StarRating.css';

interface StarRatingProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  maxStars?: number;
  size?: number;
}

export function StarRating({ 
  rating, 
  onRatingChange, 
  maxStars = 5,
  size = 14 
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const handleClick = (starIndex: number) => {
    // If clicking the same star, reset to 0
    if (starIndex === rating) {
      onRatingChange(0);
    } else {
      onRatingChange(starIndex);
    }
  };

  return (
    <div className="star-rating">
      {Array.from({ length: maxStars }, (_, index) => {
        const starNumber = index + 1;
        const isFilled = starNumber <= (hoverRating || rating);
        
        return (
          <button
            key={starNumber}
            className={`star-btn ${isFilled ? 'filled' : 'empty'}`}
            onClick={() => handleClick(starNumber)}
            onMouseEnter={() => setHoverRating(starNumber)}
            onMouseLeave={() => setHoverRating(0)}
            title={`${starNumber} star${starNumber !== 1 ? 's' : ''}`}
            type="button"
          >
            <Star 
              size={size} 
              fill={isFilled ? 'currentColor' : 'none'}
              strokeWidth={2}
            />
          </button>
        );
      })}
    </div>
  );
}

export default StarRating;
