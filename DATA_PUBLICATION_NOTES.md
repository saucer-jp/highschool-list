# 公開データ安全策メモ

このメモは、GitHub Pages で公開するデータを最小化し、出典・第三者サービスの権利リスクを下げるための作業記録です。法的助言ではありません。

## 実施したこと

- アプリが読むCSVを `resources/public_highschools.csv` に変更した。
- 公開CSVから、調査メモ、作業ステータス、レビュー用集計、座標取得元URL、学校地点の緯度経度を除外した。
- ローカル調査用ファイルは `.gitignore` に追加し、GitHub Pages の公開対象から外した。
- UIとREADMEに、偏差値・内申点・大学進学率・所在地は参考情報であり、最新情報は各校公式サイトと出典元を確認する旨を明記した。
- Google Maps API は使わず、Google Maps への通常リンクだけにした。
- 学校地点の座標は第三者サイト由来のものを再配布せず、地図表示と距離計算には HeartRails Geo API で作成した町域代表点を使う構成にした。

## 公開CSVに残す情報

- 学校ID、学科ID
- 高校名、かな、学科名、課程、共学区分
- 偏差値、偏差値出典URL
- 内申点、内申点出典URL、内申点分類、表示用内申点
- 大学進学率、大学進学率出典URL、大学進学率出典種別、進路状況の卒業年月
- 郵便番号、住所、市区町村、都道府県、地域
- 学校Webサイト、創立年、公私区分、設置者

## 除外した情報

- `resources/highschool_stage19_coverage_report.md`
- `resources/highschool_stage19_quality_rollup.csv`
- `resources/highschool_stage19_naishin_classification_tasks.csv`
- `resources/saitama_nearby_highschools_departments_stage19_naishin_classified.csv`
- 学校地点の緯度・経度
- geocode 系の作業列、座標取得元URL、内部レビュー列、ステージ別メモ列

## 確認した主な論点

- 単なる事実や数値データは一般に著作物ではないが、元サイトの文章、表全体、創作性のある選択・配列、データベースは保護対象になり得る。
- 出典明記は重要だが、利用許諾そのものではない。
- NAVITIME などの地図・地点情報サービスには、データやコンテンツの複製・頒布・公衆送信等を制限する規約があり得るため、第三者サイト由来の学校地点座標は公開CSVに含めない。
- HeartRails Geo API は商用・非商用を問わず無料利用可能とされ、アプリ内に指定クレジットを表示する条件があるため、郵便番号または住所からの町域代表点作成に使う。

## 参考リンク

- 政府広報オンライン: https://www.gov-online.go.jp/tokusyu/copyright/index.html
- e-Gov データポータル利用規約: https://data.e-gov.go.jp/info/terms
- HeartRails Geo API: https://geoapi.heartrails.com/api.html
- NAVITIME 利用規約例: https://touch.navitime.co.jp/touchstorage/html/app/transfer/common/terms.html
- School Post「高校受験ナビ」利用規約: https://school-post.com/use-policy/
