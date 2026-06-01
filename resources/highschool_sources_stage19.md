# Stage 19 Sources: 内申点未取得レコードの分類

Stage 19 では新しい数値ソースを採用せず、Stage 18 時点の未取得タスクを公開状況ベースで分類した。

## 入力ソース

- `saitama_nearby_highschools_departments_stage18_naishin_official_batch.csv`: Stage 18 の学科単位CSV。
- `highschool_stage18_naishin_remaining_tasks.csv`: Stage 18 後に内申点が未取得として残った調査タスク一覧。

## 分類方針

- 公式・準公式・受験情報サイトで明示的な内申基準を確認できない場合は、数値を推定入力しない。
- 私立校は単願/併願/推薦/個別相談/コースで基準が分かれるため、公開値がない場合は「非公表」「個別相談型」「公開基準未確認」に分類する。
- 後続作業では、各校の最新募集要項、学校説明会資料、個別相談基準資料を優先して確認する。