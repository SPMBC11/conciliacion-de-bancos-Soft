CREATE TYPE "SuggestionReviewStatus" AS ENUM ('OPEN', 'CONFIRMED', 'REJECTED', 'REQUIRES_REVIEW', 'REVERSED');

ALTER TABLE "matching_suggestions"
ADD COLUMN "review_status" "SuggestionReviewStatus" NOT NULL DEFAULT 'OPEN';
