// One email layout for every campaign: table-based and inline-styled by React Email, single column of 600px at most,
// readable with images blocked (the logo has alt text and a text wordmark next to it), one primary button, a plain
// footer with the reason, the unsubscribe link and the preferences link. Dark by default, like the app.

import React from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import { BRAND, FOOTER } from "./copy.js";

const c = BRAND.colors;
const font = BRAND.fontStack;

const s = {
  body: { backgroundColor: c.page, margin: 0, padding: "24px 12px", fontFamily: font },
  container: { maxWidth: "600px", width: "100%", margin: "0 auto" },
  brand: { margin: "0 0 16px", padding: "0 4px" },
  brandName: { display: "inline-block", verticalAlign: "middle", margin: "0 0 0 10px", fontSize: "22px", fontWeight: 800, color: c.gold, fontFamily: font },
  card: { backgroundColor: c.card, border: `1px solid ${c.edge}`, borderRadius: "16px", padding: "28px 24px" },
  title: { margin: "0 0 16px", fontSize: "24px", lineHeight: "1.25", fontWeight: 800, color: c.ink, fontFamily: font },
  p: { margin: "0 0 16px", fontSize: "16px", lineHeight: "1.6", color: c.body, fontFamily: font },
  h2: { margin: "24px 0 8px", fontSize: "17px", lineHeight: "1.3", fontWeight: 800, color: c.gold, fontFamily: font },
  li: { margin: "0 0 8px", fontSize: "16px", lineHeight: "1.5", color: c.body, fontFamily: font },
  button: { backgroundColor: c.gold, color: c.onGold, fontFamily: font, fontSize: "16px", fontWeight: 800, textDecoration: "none", borderRadius: "12px", padding: "14px 24px", display: "inline-block" },
  note: { margin: "20px 0 0", fontSize: "14px", lineHeight: "1.55", color: c.dim, fontFamily: font },
  hr: { borderColor: c.edge, margin: "24px 0 16px" },
  footer: { margin: "0 0 8px", fontSize: "13px", lineHeight: "1.55", color: c.dim, fontFamily: font, padding: "0 4px" },
  link: { color: c.violet, textDecoration: "underline" },
};

export default function Email({ lang, copy, preheader }) {
  const f = FOOTER[lang];
  return (
    <Html lang={lang} dir="ltr">
      <Head>
        <meta name="color-scheme" content="dark light" />
        <meta name="supported-color-schemes" content="dark light" />
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={s.body}>
        <Container style={s.container}>
          <Section style={s.brand}>
            <Img src={BRAND.logo} width="44" height="44" alt="" style={{ display: "inline-block", verticalAlign: "middle", borderRadius: "10px" }} />
            <Text style={s.brandName}>{BRAND.name}</Text>
          </Section>

          <Section style={s.card}>
            <Text style={{ ...s.p, margin: "0 0 8px", color: c.dim }}>{"{{greeting}}"}</Text>
            <Heading as="h1" style={s.title}>{copy.title}</Heading>
            {copy.paragraphs.map((t) => (
              <Text key={t} style={s.p}>{t}</Text>
            ))}
            {copy.bullets && (
              <>
                <Text style={s.h2}>{copy.newTitle}</Text>
                <ul style={{ margin: "0 0 16px", paddingLeft: "20px" }}>
                  {copy.bullets.map((t) => (
                    <li key={t} style={s.li}>{t}</li>
                  ))}
                </ul>
              </>
            )}
            <Section style={{ margin: "24px 0 0" }}>
              <Button href={`{{${copy.link}}}`} style={s.button}>{copy.cta}</Button>
            </Section>
            {copy.note && <Text style={s.note}>{copy.note}</Text>}
          </Section>

          <Hr style={s.hr} />
          <Text style={s.footer}>{f.why}</Text>
          <Text style={s.footer}>
            <Link href="{{unsubscribe_url}}" style={s.link}>{f.unsubscribe}</Link>
            {" · "}
            <Link href="{{prefs_url}}" style={s.link}>{f.prefs}</Link>
          </Text>
          <Text style={s.footer}>{f.who}</Text>
        </Container>
      </Body>
    </Html>
  );
}
