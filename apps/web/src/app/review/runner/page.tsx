import { Suspense } from "react";
import { ReviewRunnerClient } from "./ReviewRunnerClient";

export default function ReviewRunnerPage() {
  return (
    <Suspense fallback={null}>
      <ReviewRunnerClient />
    </Suspense>
  );
}
