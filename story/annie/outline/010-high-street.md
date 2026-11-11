# High Street

- **Kind:** scene
- **Depth:** 2
- **Status:** draft

## Synopsis

Music shop, flyer, intercom, signpost to the Mayor.

## Text

ROOM: High Street · WORLD: street · HINT: Shops, a buzzer marked S.M., and strings for sale.

* To The Three Crows (walk)

- go: [go to: Outside The Three Crows]

* Music shop (go in)

- go: [go to: Music shop]

* Song Master's flyer (pick up) SHOWN WHEN not flyer

- pick up: CAT: "Songwriting lessons with the Song Master. Ring the bell." Don't mind if I do. / [give: "lesson flyer"] / [set: flyer]

* Intercom (press)

- use with "lesson flyer": CAT: I hold the flyer up to the buzzer. It doesn't read. I should just press it.

- press WHEN stolen: CAT: I buzz. And buzz. Nobody answers any more.

- press WHEN flyer: CAT: I buzz. A crackly voice: "Songwriting? Come on up." / [set: invited]

- press: CAT: A buzzer marked "S.M.". Whoever that is.

* Song Master's door (go up) SHOWN WHEN invited, not stolen

- go: [go to: Song Master's flat]

* To the Mayor's (go to) SHOWN WHEN sold-out

- go: [go to: Mayor's office]
